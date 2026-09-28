import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { AIProviderError, type AIProvider, type StructuredRequest } from './AIProvider.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null;

  constructor(
    apiKey: string | undefined,
    readonly model: string,
    workspaceId?: string,
  ) {
    this.client = apiKey
      ? new Anthropic({
          apiKey,
          timeout: 10 * 60 * 1000,
          maxRetries: 2,
          defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined,
        })
      : null;
  }

  async isConfigured() {
    return this.client !== null;
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
    if (!this.client) throw new AIProviderError('ANTHROPIC_API_KEY não configurada.');

    try {
      const response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          thinking: { type: 'adaptive' },
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
          output_config: { format: zodOutputFormat(req.schema) },
          // Se o modelo principal recusar, a API reexecuta em um modelo alternativo.
          fallbacks: 'default',
        },
        { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
      );

      if (response.stop_reason === 'refusal') throw new AIProviderError('A IA recusou a solicitação.');
      if (response.stop_reason === 'max_tokens') throw new AIProviderError('Resposta da IA truncada.', true);
      if (!response.parsed_output) throw new AIProviderError('A IA retornou um formato inválido.', true);
      return response.parsed_output as z.infer<T>;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Anthropic.AuthenticationError) throw new AIProviderError('Chave da API de IA inválida.', false, 'A chave da API de IA é inválida ou foi revogada. Verifique ANTHROPIC_API_KEY no servidor.');
      if (err instanceof Anthropic.RateLimitError) throw new AIProviderError('Limite de uso da IA atingido.', true, 'Limite de uso da IA atingido. Aguarde alguns minutos e tente novamente.');
      if (err instanceof Anthropic.APIConnectionError) throw new AIProviderError('Falha de conexão com a IA.', true);
      if (err instanceof Anthropic.APIError) {
        const detail = (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
        if (/workspace/i.test(detail)) {
          throw new AIProviderError(detail, false, 'A chave da API de IA não está vinculada a um workspace. Defina ANTHROPIC_WORKSPACE_ID no servidor ou use uma chave criada dentro de um workspace.');
        }
        if (/credit|billing|balance/i.test(detail)) {
          throw new AIProviderError(detail, false, 'A conta da API de IA está sem créditos. Verifique o faturamento no console da Anthropic.');
        }
        throw new AIProviderError(`Erro da API de IA (${err.status}): ${detail}`, (err.status ?? 0) >= 500);
      }
      throw new AIProviderError(err instanceof Error ? err.message : 'Erro desconhecido na IA.');
    }
  }
}
