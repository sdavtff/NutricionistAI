// Configuração do servidor intermediário: chave e modelos vêm do arquivo .env (nunca do navegador).
import { AIServiceError, DEFAULT_MODEL, modelOf, visionModelOf, type OpenRouterConfig } from '../shared/openrouter';

export { analyzeImage, analyzeRequest, chat, chatRequest, generatePlan, planRequest } from '../shared/openrouter';
export { AIServiceError as HttpError };

export const PROVIDER = 'OpenRouter';

export function serverConfig(): OpenRouterConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    visionModel: process.env.OPENROUTER_VISION_MODEL || undefined,
    baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
    siteUrl: process.env.OPENROUTER_SITE_URL || undefined,
  };
}

export const MODEL = modelOf(serverConfig());
export const VISION_MODEL = visionModelOf(serverConfig());

export function aiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
