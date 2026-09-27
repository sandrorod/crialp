import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { AIProviderError, type AIProvider, type StructuredRequest } from './AIProvider.js';

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

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null;

  constructor(
    apiKey: string | undefined,
    readonly model: string,
    /** Modelos reserva usados quando o principal está sobrecarregado. */
    private readonly fallbackModels: string[] = [],
  ) {
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isConfigured() {
    return this.client !== null;
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    if (!this.client) throw new AIProviderError('GEMINI_API_KEY não configurada.');
    const jsonSchema = toGeminiSchema(req.schema);

    // Uma nova tentativa se o JSON vier fora do formato esperado
    for (let attempt = 1; attempt <= 2; attempt++) {
      let text: string | undefined;
      try {
        const response = await this.withFallback((model) =>
          this.withBackoff(() =>
            this.client!.models.generateContent({
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
        throw this.mapError(err);
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
        const overloaded = err instanceof ApiError && (err.status >= 500 || err.status === 429);
        if (!overloaded || i >= models.length - 1) throw err;
        console.warn(`[ia] ${models[i]} indisponível (${(err as ApiError).status}); usando ${models[i + 1]}`);
      }
    }
  }

  /** Sobrecarga momentânea (503) ou limite por minuto (429): espera e tenta de novo. */
  private async withBackoff<R>(fn: () => Promise<R>): Promise<R> {
    const delays = [2000, 5000, 10000];
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (err) {
        const transient = err instanceof ApiError && (err.status === 503 || err.status === 500 || (err.status === 429 && !/per ?day|daily/i.test(err.message)));
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
        return new AIProviderError(msg, false, 'A chave do Gemini é inválida ou não tem permissão. Verifique GEMINI_API_KEY no servidor.');
      }
      if (err.status === 404 || /not found|is not supported/i.test(msg)) {
        return new AIProviderError(msg, false, `O modelo "${this.model}" não está disponível para esta chave. Ajuste AI_MODEL no servidor.`);
      }
      if (err.status === 429 || /quota|rate limit|exhausted/i.test(msg)) {
        return new AIProviderError(msg, true, 'Limite de uso do Gemini atingido. Aguarde alguns minutos ou verifique a cota/faturamento no Google AI Studio.');
      }
      if (err.status >= 500) {
        return new AIProviderError(msg, true, 'O Gemini está sobrecarregado no momento. Tente novamente em alguns minutos.');
      }
      return new AIProviderError(`Erro da API Gemini (${err.status}): ${msg}`, false);
    }
    return new AIProviderError(err instanceof Error ? err.message : 'Erro desconhecido na IA.', true);
  }
}
