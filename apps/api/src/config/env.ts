import path from 'node:path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'dev-only-secret-change-me');
if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
}

// Modelo padrão por provedor; ignora um AI_MODEL de outro provedor esquecido no .env
const aiProvider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
const DEFAULT_MODELS: Record<string, string> = { anthropic: 'claude-opus-5', gemini: 'gemini-2.5-flash' };
const requestedModel = process.env.AI_MODEL?.trim();
const aiModel =
  requestedModel && !(aiProvider === 'gemini' && requestedModel.startsWith('claude')) && !(aiProvider === 'anthropic' && requestedModel.startsWith('gemini'))
    ? requestedModel
    : DEFAULT_MODELS[aiProvider] ?? requestedModel ?? '';

const appUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  appUrl,
  appHosts: new Set(
    (process.env.APP_HOSTS ?? 'localhost,127.0.0.1')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .concat(new URL(appUrl).hostname.toLowerCase()),
  ),
  jwtSecret,
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME ?? 'Administrador',
  },
  ai: {
    provider: aiProvider,
    model: aiModel,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // Necessário apenas para chaves de API não vinculadas a um workspace
    anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID || undefined,
    geminiApiKey: process.env.GEMINI_API_KEY || undefined,
    // Modelos reserva (separados por vírgula) para quando o principal estiver sobrecarregado
    fallbackModels: (process.env.AI_FALLBACK_MODELS || (aiProvider === 'gemini' ? 'gemini-2.5-flash' : ''))
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  },
  webDistDir: path.resolve(process.env.WEB_DIST_DIR ?? '../web/dist'),
};
