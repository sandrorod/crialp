import { z } from 'zod';
import { one, query } from '../../db/pool.js';
import { parseWithoutNullText } from '../../lib/nullText.js';
import { AIProviderError, type StructuredRequest } from './AIProvider.js';
import { aiKeyStore, type AIKey } from './keyStore.js';

/**
 * Gemini pelo RapidAPI: substitui as chaves do Gemini quando estão todas desativadas.
 * Cada API de Gemini no RapidAPI tem host e formato próprios, por isso ficam configuráveis
 * em Configurações (lp_settings): formato "google" (corpo igual ao generateContent oficial)
 * ou "openai" (chat/completions com messages).
 */

export interface RapidGeminiConfig {
  host: string;
  path: string;
  /** google = contents/parts; openai = messages; template = corpo copiado do Playground com {{prompt}} */
  format: 'google' | 'openai' | 'template';
  /** Modelo enviado no corpo (formato openai) — algumas APIs exigem */
  model: string;
  /**
   * Formato template: corpo JSON do Playground com "{{prompt}}" no lugar do texto.
   * Formato openai: campos extras do corpo do Playground (ex.: web_access) em JSON.
   */
  template?: string;
}

export const DEFAULT_RAPID_GEMINI_CONFIG: RapidGeminiConfig = {
  host: 'gemini-pro-ai.p.rapidapi.com',
  path: '/',
  format: 'google',
  model: 'gemini-2.5-flash',
};

const CONFIG_KEY = 'rapidapi_gemini_config';
const TIMEOUT_MS = 120_000;

export async function getRapidGeminiConfig(): Promise<RapidGeminiConfig> {
  const row = await one<{ value: string }>('select value from lp_settings where key = $1', [CONFIG_KEY]);
  try {
    return { ...DEFAULT_RAPID_GEMINI_CONFIG, ...(row ? JSON.parse(row.value) : {}) };
  } catch {
    return DEFAULT_RAPID_GEMINI_CONFIG;
  }
}

export async function saveRapidGeminiConfig(cfg: RapidGeminiConfig) {
  await query(
    `insert into lp_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [CONFIG_KEY, JSON.stringify(cfg)],
  );
}

/** Resposta normalizada: texto e locais do Google Maps citados (quando a API repassa o groundingMetadata). */
export interface RapidGeminiResponse {
  text: string;
  mapsChunks: { uri: string; title: string; placeId: string | null }[];
}

/** Texto da resposta em qualquer dos formatos comuns das APIs de Gemini do RapidAPI. */
function extractText(body: any): string {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => p?.text ?? '').join('');
  const choice = body?.choices?.[0];
  if (choice) return choice.message?.content ?? choice.text ?? '';
  for (const k of ['result', 'response', 'text', 'content', 'answer', 'output', 'message', 'data']) {
    const v = body?.[k];
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const inner = extractText(v);
      if (inner) return inner;
    }
  }
  return typeof body === 'string' ? body : '';
}

function extractMapsChunks(body: any): RapidGeminiResponse['mapsChunks'] {
  const chunks = body?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks
    .map((c: any) => c?.maps)
    .filter((m: any) => m?.uri && m?.title)
    .map((m: any) => ({ uri: String(m.uri), placeId: m.placeId ?? null, title: String(m.title).replace(/\s*-\s*Google Maps$/i, '') }));
}

/** JSON dentro do texto (aceita bloco ```json e texto antes/depois). */
function parseJsonText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const raw = (fenced ?? text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.search(/[{[]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('sem JSON');
  }
}

/** Erro da chave (inválida, sem cota, sem assinatura): vale tentar a próxima. */
const isKeyProblem = (status: number, message: string) =>
  status === 401 || status === 403 || status === 429 || /invalid api key|not subscribed|quota|exceeded|rate limit/i.test(message);

class RapidStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Recusa do serviço por trás do RapidAPI (não da chave): algum campo do corpo não é aceito. */
const isInvalidProperty = (status: number, message: string) => (status === 400 || status === 403) && /invalid request or property/i.test(message);

/** Recusa da própria chave pelo RapidAPI (inválida ou sem assinatura da API). */
const isKeyRejected = (status: number, message: string) => status === 401 || /invalid api key|not subscribed/i.test(message);

async function call(
  cfg: RapidGeminiConfig,
  key: string,
  input: { system?: string; prompt: string; json?: boolean; maps?: boolean },
  /** Só as mensagens: sem modelo, campos extras nem formato de resposta (APIs que recusam campos a mais) */
  minimal = false,
): Promise<RapidGeminiResponse> {
  const path = cfg.path.startsWith('/') ? cfg.path : `/${cfg.path}`;
  const extra = (() => {
    try {
      return cfg.format === 'openai' && cfg.template ? (JSON.parse(cfg.template) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  const fullPrompt = input.system ? `${input.system}\n\n${input.prompt}` : input.prompt;
  const body =
    cfg.format === 'template'
      ? JSON.parse((cfg.template ?? '"{{prompt}}"').split('"{{prompt}}"').join(JSON.stringify(fullPrompt)))
      : cfg.format === 'openai' && minimal
        ? { messages: [{ role: 'user', content: fullPrompt }] }
        : cfg.format === 'openai'
          ? {
              ...extra,
              ...(cfg.model ? { model: cfg.model } : {}),
              // Instrução junto da mensagem: muitas APIs do RapidAPI recusam o papel "system"
              messages: [{ role: 'user', content: fullPrompt }],
              ...(input.json ? { response_format: { type: 'json_object' } } : {}),
            }
          : {
              contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
              ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
              ...(input.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
              ...(input.maps ? { tools: [{ googleMaps: {} }] } : {}),
            };
  const res = await fetch(`https://${cfg.host}${path}`, {
    method: 'POST',
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': cfg.host, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err) => {
    throw new RapidStatusError(504, err?.name === 'TimeoutError' ? 'O RapidAPI demorou demais para responder.' : 'Falha de conexão com o RapidAPI.');
  });
  // Cota do plano (requests, tokens) vem em toda resposta: atualiza o uso mostrado em Configurações
  void aiKeyStore.recordQuota(key, res.headers);
  const raw = await res.text();
  let parsed: any = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* texto puro */
  }
  if (!res.ok) {
    const msg = String(parsed?.message ?? parsed?.error?.message ?? parsed?.error ?? raw).slice(0, 300);
    throw new RapidStatusError(res.status, `${res.status}: ${msg}`);
  }
  const text = extractText(parsed).trim();
  if (!text) throw new RapidStatusError(502, 'Resposta do RapidAPI sem texto (verifique host, caminho e formato em Configurações).');
  return { text, mapsChunks: extractMapsChunks(parsed) };
}

/**
 * Formato errado é a causa comum de 400 (o MCP configuration não diz o formato): a própria API avisa
 * qual campo espera ("messages" → OpenAI; "contents" → Google). Tenta de novo nesse formato e grava
 * o que funcionou, para os próximos usos já irem certo.
 */
/** 429 do limite por segundo/minuto (não é cota): espera e tenta de novo a mesma chave. */
async function callWithBurstRetry(cfg: RapidGeminiConfig, key: string, input: Parameters<typeof call>[2]): Promise<RapidGeminiResponse> {
  const delays = [1200, 2500, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(cfg, key, input);
    } catch (err) {
      const burst = err instanceof RapidStatusError && err.status === 429 && !/quota|monthly|daily|per (day|month|hour)/i.test(err.message);
      if (!burst || attempt >= delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt] + Math.random() * 500));
    }
  }
}

async function callAdaptive(cfg: RapidGeminiConfig, key: string, input: Parameters<typeof call>[2]): Promise<RapidGeminiResponse> {
  try {
    return await callWithBurstRetry(cfg, key, input);
  } catch (err) {
    // "Invalid request or property": o serviço recusou um campo (modelo, response_format…) — tenta só com as mensagens
    if (err instanceof RapidStatusError && cfg.format === 'openai' && isInvalidProperty(err.status, err.message)) {
      const r = await call(cfg, key, input, true);
      console.warn(`[rapidapi-gemini] ${cfg.host}: pedido aceito só com as mensagens (sem modelo/response_format)`);
      return r;
    }
    if (!(err instanceof RapidStatusError) || err.status !== 400 || cfg.format === 'template') throw err;
    const wanted: RapidGeminiConfig['format'] | null =
      /\bmessages\b/i.test(err.message) && cfg.format !== 'openai' ? 'openai' : /\bcontents\b/i.test(err.message) && cfg.format !== 'google' ? 'google' : null;
    if (!wanted) throw err;
    const next: RapidGeminiConfig = { ...cfg, format: wanted, template: wanted === 'openai' ? cfg.template : '' };
    const r = await callWithBurstRetry(next, key, input);
    await saveRapidGeminiConfig(next);
    console.warn(`[rapidapi-gemini] ${cfg.host}: formato ajustado de ${cfg.format} para ${wanted}`);
    return r;
  }
}

function toUserError(err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const status = err instanceof RapidStatusError ? err.status : 0;
  if (isKeyRejected(status, msg)) {
    return new AIProviderError(msg, false, 'A chave do RapidAPI (Gemini) é inválida ou não assina a API configurada. Verifique em Configurações.');
  }
  // 403 sem ser da chave: o serviço do Gemini por trás do RapidAPI recusou o pedido — mostra o motivo real
  if (status === 403 || isInvalidProperty(status, msg)) {
    return new AIProviderError(
      msg,
      true,
      `A API do Gemini no RapidAPI recusou o pedido (${msg}). A chave é aceita pelo RapidAPI; o problema é no serviço da API. Tente de novo em alguns minutos ou veja o Playground da API no RapidAPI.`,
    );
  }
  if (status === 429 || /quota|exceeded|rate limit/i.test(msg)) {
    return new AIProviderError(msg, true, 'Limite de uso do RapidAPI (Gemini) atingido em todas as chaves. Aguarde ou cadastre outra chave em Configurações.');
  }
  return new AIProviderError(msg, status >= 500 || status === 0, `Erro do RapidAPI (Gemini): ${msg}`);
}

export const rapidGemini = {
  hasAny: () => aiKeyStore.hasAny('rapidapi_gemini'),

  /** Valida uma chave antes de cadastrar: precisa responder um texto pela API configurada. */
  async testKey(key: string) {
    const cfg = await getRapidGeminiConfig();
    try {
      await callAdaptive(cfg, key.trim(), { prompt: 'Responda apenas: ok' });
    } catch (err) {
      throw toUserError(err);
    }
  },

  /** Rodízio entre as chaves; a próxima é usada se a chave falhar por cota, assinatura ou chave inválida. */
  async run(input: { system?: string; prompt: string; json?: boolean; maps?: boolean }): Promise<RapidGeminiResponse> {
    const keys: AIKey[] = await aiKeyStore.rotation('rapidapi_gemini');
    if (!keys.length) {
      throw new AIProviderError(
        'Nenhuma chave configurada.',
        false,
        'Nenhuma chave do Gemini ativa. Ative uma chave do Gemini ou cadastre uma em "Chaves do RapidAPI — Gemini" em Configurações.',
      );
    }
    const cfg = await getRapidGeminiConfig();
    let lastError: unknown;
    for (const key of keys) {
      try {
        const r = await callAdaptive(cfg, key.key, input);
        await aiKeyStore.recordUse(key.id);
        await aiKeyStore.clearError(key.id);
        return r;
      } catch (err) {
        lastError = err;
        const status = err instanceof RapidStatusError ? err.status : 0;
        const msg = err instanceof Error ? err.message : String(err);
        if (!isKeyProblem(status, msg) && status < 500) throw toUserError(err);
        await aiKeyStore.recordError(key.id, msg);
      }
    }
    throw toUserError(lastError);
  },

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    // O formato é pedido no próprio texto: nem toda API do RapidAPI aceita schema estruturado
    const schema = JSON.stringify(z.toJSONSchema(req.schema, { target: 'draft-7' }));
    const prompt = `${req.prompt}\n\nResponda SOMENTE com um JSON válido (sem texto antes ou depois) que siga este JSON Schema:\n${schema}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { text } = await this.run({ system: req.system, prompt, json: true });
      try {
        const parsed = parseWithoutNullText(req.schema, parseJsonText(text));
        if (parsed.success) return parsed.data;
        if (attempt === 2) throw new AIProviderError(`Formato inválido: ${parsed.error.issues[0]?.message}`, true);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        if (attempt === 2) throw new AIProviderError('A IA (RapidAPI) retornou um JSON inválido.', true);
      }
    }
    throw new AIProviderError('A IA (RapidAPI) retornou um formato inválido.', true);
  },
};
