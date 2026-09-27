import type { z } from 'zod';

export interface StructuredRequest<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
}

/**
 * Contrato de um provedor de IA. Para trocar de provedor, basta implementar
 * esta interface e registrá-la em services/ai/index.ts — os prompts e as
 * regras de negócio ficam no AIService e não mudam.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    /** Mensagem segura para exibir ao administrador (erros de configuração). */
    public readonly userMessage?: string,
  ) {
    super(message);
  }
}
