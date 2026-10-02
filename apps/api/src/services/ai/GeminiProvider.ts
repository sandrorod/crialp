import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { parseWithoutNullText } from '../../lib/nullText.js';
import { AIProviderError, type AIProvider, type StructuredRequest } from './AIProvider.js';
import { aiKeyStore, type AIKey } from './keyStore.js';

/** Converte o schema Zod em JSON Schema aceito pelo Gemini (sem metadados nem limites de inteiro gigantes). */
function toGeminiSchema(schema: z.ZodType): unknown {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema') continue;
      if ((k === 'minimum' || k === 'maximum') && typeof v === 'number' && Math.abs(v) >= Number.MAX_SAFE_INTEGER) continue;
      out[k] = clean(v);
    }
    return out;
  };
  return clean(z.toJSONSchema(schema, { target: 'draft-7' }));
}

/** Erro que é da chave (cota esgotada, chave inválida/sem permissão): vale tentar a próxima chave. */
/** Gemini sobrecarregado ou instável (500/503): não é culpa da chave, mas outra chave ou uma nova tentativa costuma resolver. */
function isOverloaded(err: unknown) {
  return err instanceof ApiError && (err.status >= 500 || /overloaded|unavailable|high demand/i.test(err.message ?? ''));
}

/** Pausas entre as rodadas por todas as chaves quando o Gemini está sobrecarregado. */
const OVERLOAD_ROUND_DELAYS = [6000, 15000, 30000];

function isKeyError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  return err.status === 401 || err.status === 403 || err.status === 429 || /api key not valid|API_KEY_INVALID|permission|quota|exhausted/i.test(err.message ?? '');
}

/** Dados do Google Maps lidos pela consulta do Gemini. */
export interface GooglePlaceInfo {
  /** Texto "Campo: valor" com os dados do perfil */
  text: string;
  mapsUri: string;
  title: string;
}

/** Local do Google Maps listado numa pesquisa. */
export interface GooglePlaceListing {
  name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUri: string;
  placeId: string | null;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly clients = new Map<string, GoogleGenAI>();
  /** Modelo encontrado para cada chave quando os configurados não existem para ela */
  private readonly discoveredModels = new Map<string, string | null>();

  constructor(
    /** Chave da variável de ambiente (opcional): entra no rodízio junto com as cadastradas no painel. */
    private readonly envKey: string | undefined,
    readonly model: string,
    /** Modelos reserva usados quando o principal está sobrecarregado. */
    private readonly fallbackModels: string[] = [],
  ) {}

  isConfigured() {
    return aiKeyStore.hasAny('gemini', this.envKey);
  }

  private clientFor(key: string) {
    let c = this.clients.get(key);
    if (!c) {
      c = new GoogleGenAI({ apiKey: key });
      this.clients.set(key, c);
    }
    return c;
  }

  /**
   * Valida uma chave antes de cadastrá-la. Só confere se o Google aceita a chave: a disponibilidade
   * do modelo não recusa o cadastro, porque na geração o modelo reserva assume.
   */
  async testKey(key: string): Promise<void> {
    try {
      await new GoogleGenAI({ apiKey: key.trim() }).models.list({ config: { pageSize: 1 } });
    } catch (err) {
      throw this.mapError(err);
    }
  }

  /**
   * Rodízio: cada chamada começa pela próxima chave da fila. Se a chave falhar por cota
   * ou por ser inválida, a mesma chamada segue para a chave seguinte.
   */
  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    const keys = await aiKeyStore.rotation('gemini', this.envKey);
    if (!keys.length) throw new AIProviderError('Nenhuma chave do Gemini configurada.', false, 'Nenhuma chave do Gemini cadastrada. Adicione uma em Configurações.');
    let lastError: unknown;
    // Sobrecarga não aparece para o usuário: passa para a próxima chave e, se todas estiverem
    // sobrecarregadas, espera um pouco e faz outra rodada
    for (let round = 0; round <= OVERLOAD_ROUND_DELAYS.length; round++) {
      let overloaded = false;
      for (const [i, key] of keys.entries()) {
        try {
          const result = await this.generateWithKey(req, key, keys.length === 1);
          await aiKeyStore.recordUse(key.id);
          await aiKeyStore.clearError(key.id);
          return result;
        } catch (err) {
          const raw = (err as { cause?: unknown }).cause ?? err;
          if (isOverloaded(raw)) {
            overloaded = true;
            lastError = err;
            console.warn(`[ia] Gemini sobrecarregado na chave "${key.label}" (${(raw as ApiError).status}); tentando ${i < keys.length - 1 ? 'a próxima chave' : 'nova rodada'}`);
            continue;
          }
          if (!isKeyError(raw)) throw err;
          lastError = err;
          await aiKeyStore.recordError(key.id, raw instanceof Error ? raw.message : String(raw));
          if (i < keys.length - 1) console.warn(`[ia] chave "${key.label}" indisponível (${(raw as ApiError).status}); tentando a próxima`);
        }
      }
      if (!overloaded || round === OVERLOAD_ROUND_DELAYS.length) break;
      await new Promise((r) => setTimeout(r, OVERLOAD_ROUND_DELAYS[round]));
    }
    throw lastError instanceof AIProviderError ? lastError : this.mapError(lastError);
  }

  private async generateWithKey<T extends z.ZodType>(req: StructuredRequest<T>, key: AIKey, onlyKey: boolean): Promise<z.infer<T>> {
    const client = this.clientFor(key.key);
    const jsonSchema = toGeminiSchema(req.schema);

    // Uma nova tentativa se o JSON vier fora do formato esperado
    for (let attempt = 1; attempt <= 2; attempt++) {
      let text: string | undefined;
      try {
        const response = await this.withFallback(client, key.key, (model) =>
          this.withBackoff(onlyKey, () =>
            client.models.generateContent({
              model,
              contents: req.prompt,
              config: {
                systemInstruction: req.system,
                responseMimeType: 'application/json',
                responseJsonSchema: jsonSchema,
                maxOutputTokens: req.maxTokens ?? 32000,
              },
            }),
          ),
        );
        const reason = response.candidates?.[0]?.finishReason;
        if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || response.promptFeedback?.blockReason) {
          throw new AIProviderError('A IA recusou a solicitação.');
        }
        if (reason === 'MAX_TOKENS') throw new AIProviderError('Resposta da IA truncada.', true);
        text = response.text;
      } catch (err) {
        // Guarda o erro original: o rodízio decide se tenta a próxima chave
        const mapped = this.mapError(err);
        (mapped as { cause?: unknown }).cause = err;
        throw mapped;
      }

      try {
        const parsed = parseWithoutNullText(req.schema, JSON.parse(text ?? ''));
        if (parsed.success) return parsed.data;
        if (attempt === 2) throw new AIProviderError(`Formato inválido: ${parsed.error.issues[0]?.message}`, true);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        if (attempt === 2) throw new AIProviderError('A IA retornou um JSON inválido.', true);
      }
    }
    throw new AIProviderError('A IA retornou um formato inválido.', true);
  }

  /**
   * Dados do Perfil da Empresa no Google (Google Maps) via Gemini com consulta ao Maps.
   * Só devolve o que o Maps traz; sem local encontrado no Maps, devolve null.
   */
  async describeGooglePlace(query: string, latLng?: { latitude: number; longitude: number }): Promise<GooglePlaceInfo | null> {
    const keys = await aiKeyStore.rotation('gemini', this.envKey);
    if (!keys.length) throw new AIProviderError('Nenhuma chave do Gemini configurada.', false, 'Nenhuma chave do Gemini cadastrada. Adicione uma em Configurações.');
    const prompt =
      `Consulte o Google Maps e encontre o estabelecimento: "${query}".\n` +
      'Responda em português, uma informação por linha, no formato "Campo: valor", usando SOMENTE dados do Google Maps desse local ' +
      '(nunca complete com suposições; campo sem dado no Maps não aparece):\n' +
      'Nome, Categoria, Endereço completo, Telefone, Site, Horário de funcionamento (um dia por linha), Nota e número de avaliações, ' +
      'Descrição do local (texto do próprio perfil), Serviços/comodidades listados no perfil.\n' +
      'Se não encontrar o local no Google Maps, responda apenas: NAO_ENCONTRADO';
    let lastError: unknown;
    // Consulta ao Maps funciona nos modelos 2.5: começa por ele e depois tenta os configurados
    const models = [...new Set(['gemini-2.5-flash', this.model, ...this.fallbackModels])];
    for (const key of keys) {
      const client = this.clientFor(key.key);
      for (const model of models) {
        try {
          const response = await client.models.generateContent({
            model,
            contents: prompt,
            config: {
              tools: [{ googleMaps: {} }],
              ...(latLng ? { toolConfig: { retrievalConfig: { latLng } } } : {}),
            },
          });
          await aiKeyStore.recordUse(key.id);
          const text = (response.text ?? '').trim();
          const chunk = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.find((c) => c.maps?.uri);
          if (!chunk?.maps || !text || /NAO_ENCONTRADO/.test(text)) return null;
          return { text, mapsUri: chunk.maps.uri!, title: chunk.maps.title?.replace(/\s*-\s*Google Maps$/i, '') ?? query };
        } catch (err) {
          lastError = err;
          const missing = err instanceof ApiError && (err.status === 404 || err.status === 400 || /not (found|supported|enabled)/i.test(err.message ?? ''));
          if (missing || isOverloaded(err)) continue; // tenta o próximo modelo
          if (!isKeyError(err)) throw this.mapError(err);
          await aiKeyStore.recordError(key.id, err instanceof Error ? err.message : String(err));
          break; // próxima chave
        }
      }
    }
    throw this.mapError(lastError);
  }

  /**
   * Locais do Google Maps para uma pesquisa (ex.: "manutenção predial em Rio Preto"). Só entram os locais
   * que o Maps confirmou na resposta (cada um tem link do Maps); dados ausentes ficam null.
   */
  async searchGooglePlaces(query: string): Promise<GooglePlaceListing[]> {
    const keys = await aiKeyStore.rotation('gemini', this.envKey);
    if (!keys.length) throw new AIProviderError('Nenhuma chave do Gemini configurada.', false, 'Nenhuma chave do Gemini cadastrada. Adicione uma em Configurações.');
    const prompt =
      `Use o Google Maps para listar até 10 estabelecimentos para a pesquisa: "${query}".\n` +
      'Para cada um, uma linha no formato: Nome | Telefone | Endereço | Site | Nota | Avaliações\n' +
      'Use "-" quando o Maps não tiver o dado. Não invente nada. Sem texto extra.';
    let lastError: unknown;
    for (const key of keys) {
      const client = this.clientFor(key.key);
      for (const model of [...new Set(['gemini-2.5-flash', this.model, ...this.fallbackModels])]) {
        try {
          const response = await client.models.generateContent({ model, contents: prompt, config: { tools: [{ googleMaps: {} }] } });
          await aiKeyStore.recordUse(key.id);
          const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
            .map((c) => c.maps)
            .filter((m): m is NonNullable<typeof m> => !!m?.uri && !!m.title)
            .map((m) => ({ uri: m.uri!, placeId: m.placeId ?? null, title: m.title!.replace(/\s*-\s*Google Maps$/i, '') }));
          const key2 = (v: string) => v.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
          const dash = (v: string | undefined) => (v && v.trim() !== '-' ? v.trim() : null);
          const out: GooglePlaceListing[] = [];
          for (const line of (response.text ?? '').split('\n')) {
            const cols = line.replace(/^\s*[*•-]\s*/, '').split('|').map((c) => c.trim());
            if (cols.length < 4 || !cols[0]) continue;
            const name = cols[0].replace(/\*\*/g, '');
            // Só locais confirmados pelo Maps (o nome bate com um local citado na resposta)
            const chunk = chunks.find((c) => key2(c.title) === key2(name)) ?? chunks.find((c) => key2(c.title).includes(key2(name)) || key2(name).includes(key2(c.title)));
            if (!chunk || out.some((o) => o.mapsUri === chunk.uri)) continue;
            const rating = Number(dash(cols[4])?.replace(',', '.'));
            const reviews = Number(dash(cols[5])?.replace(/\D/g, ''));
            out.push({
              name: chunk.title,
              phone: dash(cols[1]),
              address: dash(cols[2]),
              website: dash(cols[3]),
              rating: Number.isFinite(rating) && rating > 0 ? rating : null,
              reviews: Number.isFinite(reviews) && reviews > 0 ? reviews : null,
              mapsUri: chunk.uri,
              placeId: chunk.placeId,
            });
          }
          return out;
        } catch (err) {
          lastError = err;
          const missing = err instanceof ApiError && (err.status === 404 || err.status === 400 || /not (found|supported|enabled)/i.test(err.message ?? ''));
          if (missing || isOverloaded(err)) continue;
          if (!isKeyError(err)) throw this.mapError(err);
          await aiKeyStore.recordError(key.id, err instanceof Error ? err.message : String(err));
          break;
        }
      }
    }
    throw this.mapError(lastError);
  }

  /** Tenta o modelo principal e, se continuar sobrecarregado, os modelos reserva. */
  /**
   * Tenta o modelo principal e os reservas. Se nenhum existir para a chave (nome descontinuado ou
   * indisponível no projeto), pergunta ao Google quais modelos a chave pode usar e escolhe um Flash.
   */
  private async withFallback<R>(client: GoogleGenAI, apiKey: string, fn: (model: string) => Promise<R>): Promise<R> {
    const models = [this.model, ...this.fallbackModels.filter((m) => m && m !== this.model)];
    let discovered = false;
    for (let i = 0; ; i++) {
      try {
        return await fn(models[i]);
      } catch (err) {
        // Sobrecarga, cota do modelo (no Gemini a cota é por modelo) ou modelo inexistente para a chave: tenta o reserva
        const overloaded = err instanceof ApiError && (err.status >= 500 || err.status === 429);
        const missing = err instanceof ApiError && (err.status === 404 || /not found|is not supported/i.test(err.message ?? ''));
        if (!(overloaded || missing)) throw err;
        if (i >= models.length - 1) {
          if (!missing || discovered) throw err;
          discovered = true;
          const available = await this.availableModel(client, apiKey, models);
          if (!available) throw err;
          models.push(available);
        }
        console.warn(`[ia] ${models[i]} indisponível (${(err as ApiError).status}); usando ${models[i + 1]}`);
      }
    }
  }

  /** Melhor modelo Flash que a chave pode usar (estável antes de prévia, versão mais nova primeiro). */
  private async availableModel(client: GoogleGenAI, apiKey: string, tried: string[]): Promise<string | null> {
    const cached = this.discoveredModels.get(apiKey);
    if (cached !== undefined) return cached && !tried.includes(cached) ? cached : null;
    const names: string[] = [];
    try {
      const pager = await client.models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        if (m.name && (m.supportedActions ?? ['generateContent']).includes('generateContent')) names.push(m.name.replace(/^models\//, ''));
      }
    } catch (err) {
      console.warn('[ia] não foi possível listar os modelos da chave:', err instanceof Error ? err.message : err);
      return null;
    }
    const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
    const candidates = names
      .filter((n) => /^gemini-/.test(n) && !/(image|tts|audio|live|embedding|vision|robotics|computer-use|native)/i.test(n) && !tried.includes(n))
      .sort(
        (a, b) =>
          Number(/flash/.test(b) && !/lite/.test(b)) - Number(/flash/.test(a) && !/lite/.test(a)) ||
          Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)) ||
          version(b) - version(a) ||
          a.length - b.length,
      );
    const pick = candidates[0] ?? null;
    console.warn(`[ia] modelos disponíveis para a chave: ${names.join(', ') || 'nenhum'}; escolhido: ${pick ?? 'nenhum'}`);
    this.discoveredModels.set(apiKey, pick);
    return pick;
  }


  /** Sobrecarga momentânea (503) ou limite por minuto (429): espera e tenta de novo. */
  private async withBackoff<R>(onlyKey: boolean, fn: () => Promise<R>): Promise<R> {
    const delays = [2000, 5000, 10000];
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (err) {
        // Limite por minuto (429): com uma chave só, espera e tenta de novo; com várias, o rodízio passa para a próxima
        const perMinute = err instanceof ApiError && err.status === 429 && !/per ?day|daily/i.test(err.message);
        // Sobrecarga com várias chaves: não insiste nesta, o rodízio passa para a próxima na hora
        const transient = err instanceof ApiError && onlyKey && (err.status === 503 || err.status === 500 || perMinute);
        if (!transient || i >= delays.length) throw err;
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
  }

  private mapError(err: unknown): AIProviderError {
    if (err instanceof AIProviderError) return err;
    if (err instanceof ApiError) {
      const msg = err.message ?? '';
      if (/api key not valid|API_KEY_INVALID|permission|unauthori[sz]ed/i.test(msg) || err.status === 401 || err.status === 403) {
        return new AIProviderError(msg, false, 'A chave do Gemini é inválida ou não tem permissão. Verifique as chaves em Configurações.');
      }
      if (err.status === 404 || /not found|is not supported/i.test(msg)) {
        return new AIProviderError(msg, false, `O modelo "${this.model}" não está disponível para esta chave. Ajuste AI_MODEL no servidor.`);
      }
      if (err.status === 429 || /quota|rate limit|exhausted/i.test(msg)) {
        return new AIProviderError(msg, true, 'Limite de uso do Gemini atingido em todas as chaves. Aguarde alguns minutos, cadastre mais chaves em Configurações ou verifique a cota no Google AI Studio.');
      }
      if (err.status >= 500) {
        return new AIProviderError(msg, true, 'O Gemini está sobrecarregado no momento. Tente novamente em alguns minutos.');
      }
      return new AIProviderError(`Erro da API Gemini (${err.status}): ${msg}`, false);
    }
    return new AIProviderError(err instanceof Error ? err.message : 'Erro desconhecido na IA.', true);
  }
}
