import { createHash } from 'node:crypto';
import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

// Sem JWT_SECRET, deriva a chave da DATABASE_URL (que já contém a senha do banco).
// Trocar a senha do banco encerra as sessões abertas. Validado em ensureReady(), não na importação.
const explicitJwtSecret = process.env.JWT_SECRET || undefined;
const jwtSecret =
  explicitJwtSecret ??
  (process.env.DATABASE_URL
    ? createHash('sha256').update(`lp-jwt:${process.env.DATABASE_URL}`).digest('hex')
    : isProduction
      ? ''
      : 'dev-only-secret-change-me');
const jwtSecretError =
  isProduction && explicitJwtSecret && explicitJwtSecret.length < 32
    ? 'JWT_SECRET deve ter pelo menos 32 caracteres em produção.'
    : null;

// Modelo padrão por provedor; ignora um AI_MODEL de outro provedor esquecido no .env
const aiProvider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
const DEFAULT_MODELS: Record<string, string> = { anthropic: 'claude-opus-5', gemini: 'gemini-2.5-flash' };
const requestedModel = process.env.AI_MODEL?.trim();
const aiModel =
  requestedModel && !(aiProvider === 'gemini' && requestedModel.startsWith('claude')) && !(aiProvider === 'anthropic' && requestedModel.startsWith('gemini'))
    ? requestedModel
    : DEFAULT_MODELS[aiProvider] ?? requestedModel ?? '';

const isVercel = !!process.env.VERCEL;
// No Vercel, sem APP_URL definida, usa o domínio de produção do projeto
const appUrl = (
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173')
).replace(/\/$/, '');

const appHosts = new Set(
  (process.env.APP_HOSTS ?? 'localhost,127.0.0.1')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .concat(new URL(appUrl).hostname.toLowerCase())
    .concat([process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter((h): h is string => !!h).map((h) => h.toLowerCase())),
);

/** Host do próprio sistema (usado na checagem de origem/CSRF): só os domínios deste deploy. */
function isAppHost(host: string) {
  return appHosts.has(host.toLowerCase());
}

/**
 * Roteamento: hosts que NÃO são domínio personalizado de LP. No Vercel inclui
 * *.vercel.app (URLs de preview), que nunca pertencem a clientes.
 */
function isSystemHost(host: string) {
  const h = host.toLowerCase();
  return appHosts.has(h) || (isVercel && h.endsWith('.vercel.app'));
}

export const env = {
  isProduction,
  isVercel,
  isAppHost,
  isSystemHost,
  port: Number(process.env.PORT ?? 3333),
  // Validada em ensureReady(), para o sistema poder exibir uma mensagem clara em vez de travar
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  appUrl,
  appHosts,
  jwtSecret,
  jwtSecretError,
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
    // No Vercel o disco é somente leitura: usa Vercel Blob quando o token existe
    driver: process.env.STORAGE_DRIVER ?? (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'local'),
    uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  },
  webDistDir: path.resolve(process.env.WEB_DIST_DIR ?? '../../dist/admin'),
};
