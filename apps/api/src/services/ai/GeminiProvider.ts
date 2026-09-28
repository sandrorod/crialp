import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
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
function isKeyError(err: unknown) {
  if (!(err instanceof ApiError)) return false;
  return err.status === 401 || err.status === 403 || err.status === 429 || /api key not valid|API_KEY_INVALID|permission|quota|exhausted/i.test(err.message ?? '');
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly clients = new Map<string, GoogleGenAI>();

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

  /** Valida uma chave antes de cadastrá-la (consulta o modelo configurado). */
  async testKey(key: string): Promise<void> {
    try {
      await new GoogleGenAI({ apiKey: key.trim() }).models.get({ model: this.model });
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
    for (const [i, key] of keys.entries()) {
      try {
        const result = await this.generateWithKey(req, key, keys.length === 1);
        await aiKeyStore.recordUse(key.id);
        await aiKeyStore.clearError(key.id);
        return result;
      } catch (err) {
        const raw = (err as { cause?: unknown }).cause ?? err;
        if (!isKeyError(raw)) throw err;
        lastError = err;
        await aiKeyStore.recordError(key.id, raw instanceof Error ? raw.message : String(raw));
        if (i < keys.length - 1) console.warn(`[ia] chave "${key.label}" indisponível (${(raw as ApiError).status}); tentando a próxima`);
      }
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
        const response = await this.withFallback((model) =>
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
        const parsed = req.schema.safeParse(JSON.parse(text ?? ''));
        if (parsed.success) return parsed.data;
        if (attempt === 2) throw new AIProviderError(`Formato inválido: ${parsed.error.issues[0]?.message}`, true);
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        if (attempt === 2) throw new AIProviderError('A IA retornou um JSON inválido.', true);
      }
    }
    throw new AIProviderError('A IA retornou um formato inválido.', true);
  }

  /** Tenta o modelo principal e, se continuar sobrecarregado, os modelos reserva. */
  private async withFallback<R>(fn: (model: string) => Promise<R>): Promise<R> {
    const models = [this.model, ...this.fallbackModels.filter((m) => m && m !== this.model)];
    for (let i = 0; ; i++) {
      try {
        return await fn(models[i]);
      } catch (err) {
        // Sobrecarga ou cota do modelo (no Gemini a cota é por modelo): tenta o modelo reserva
        const overloaded = err instanceof ApiError && (err.status >= 500 || err.status === 429);
        if (!overloaded || i >= models.length - 1) throw err;
        console.warn(`[ia] ${models[i]} indisponível (${(err as ApiError).status}); usando ${models[i + 1]}`);
      }
    }
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
        const transient = err instanceof ApiError && (err.status === 503 || err.status === 500 || (onlyKey && perMinute));
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
