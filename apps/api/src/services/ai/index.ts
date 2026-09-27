import { env } from '../../config/env.js';
import type { AIProvider } from './AIProvider.js';
import { AIService } from './AIService.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { GeminiProvider } from './GeminiProvider.js';

function createProvider(): AIProvider {
  switch (env.ai.provider) {
    case 'anthropic':
      return new AnthropicProvider(env.ai.anthropicApiKey, env.ai.model, env.ai.anthropicWorkspaceId);
    case 'gemini':
      return new GeminiProvider(env.ai.geminiApiKey, env.ai.model, env.ai.fallbackModels);
    // Novos provedores: implemente AIProvider e adicione aqui.
    default:
      throw new Error(`AI_PROVIDER desconhecido: ${env.ai.provider}`);
  }
}

export const aiService = new AIService(createProvider());
export { AIProviderError } from './AIProvider.js';
