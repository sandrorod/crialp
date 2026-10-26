import { createHash } from 'node:crypto';
import path from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

// Em produção o JWT_SECRET é obrigatório: assina as sessões e deriva a chave que criptografa as chaves
// de API salvas no banco (services/ai/keyStore.ts). Antes, sem ele, a chave vinha da DATABASE_URL —
// previsível para quem conhece a senha do banco. No desenvolvimento local continua opcional.
// Validado em ensureReady(), não na importação, para o sistema exibir uma mensagem clara.
// Sem trim: o valor é usado exatamente como está (trocar o segredo derruba as sessões e as chaves salvas)
const explicitJwtSecret = process.env.JWT_SECRET || undefined;
const jwtSecret =
  explicitJwtSecret ??
  (isProduction
    ? ''
    : process.env.DATABASE_URL
      ? createHash('sha256').update(`lp-jwt:${process.env.DATABASE_URL}`).digest('hex')
      : 'dev-only-secret-change-me');
// Valores de exemplo (.env.example, README) não servem como segredo
const PLACEHOLDER_SECRETS = ['troque-por-um-segredo-longo-e-aleatorio', 'dev-only-secret-change-me'];
const dbPassword = (() => {
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').password);
  } catch {
    return '';
  }
})();
const jwtSecretError = !isProduction
  ? null
  : !explicitJwtSecret
    ? "JWT_SECRET não configurado. Em produção defina um segredo aleatório de pelo menos 32 caracteres (ex.: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\")."
    : PLACEHOLDER_SECRETS.includes(explicitJwtSecret) || (dbPassword.length >= 8 && explicitJwtSecret.includes(dbPassword))
      ? 'JWT_SECRET usa um valor de exemplo ou a senha do banco. Gere um segredo aleatório exclusivo.'
      : null;
// Segredo curto num sistema que já está no ar: só avisa (parar derrubaria o sistema). Para trocar sem perder
// sessões nem as chaves salvas, defina o novo em JWT_SECRET e o atual em JWT_SECRET_PREVIOUS.
const jwtSecretWarning =
  isProduction && explicitJwtSecret && explicitJwtSecret.length < 32
    ? 'JWT_SECRET com menos de 32 caracteres: troque por um segredo aleatório longo (o atual vai para JWT_SECRET_PREVIOUS).'
    : null;
/** Segredo anterior, durante a troca: sessões, chaves criptografadas e webhooks antigos continuam valendo. */
const jwtSecretPrevious = process.env.JWT_SECRET_PREVIOUS || undefined;

// Modelo padrão por provedor; ignora um AI_MODEL de outro provedor esquecido no .env
const aiProvider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
const DEFAULT_MODELS: Record<string, string> = { anthropic: 'claude-opus-5', gemini: 'gemini-2.5-flash' };
const requestedModel = process.env.AI_MODEL?.trim();
const aiModel =
  requestedModel && !(aiProvider === 'gemini' && requestedModel.startsWith('claude')) && !(aiProvider === 'anthropic' && requestedModel.startsWith('gemini'))
    ? requestedModel
    : (DEFAULT_MODELS[aiProvider] ?? requestedModel ?? '');

const isVercel = !!process.env.VERCEL;
// No Vercel, sem APP_URL definida, usa o domínio de produção do projeto
const appUrl = (
  process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173')
).replace(/\/$/, '');

const appHosts = new Set(
  (process.env.APP_HOSTS ?? 'localhost,127.0.0.1')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .concat(new URL(appUrl).hostname.toLowerCase())
    .concat(
      [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
        .filter((h): h is string => !!h)
        .map((h) => h.toLowerCase()),
    ),
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
  jwtSecretWarning,
  jwtSecretPrevious,
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
    // No Gemini, o gemini-2.5-flash é sempre o último reserva (mesmo com AI_FALLBACK_MODELS definido)
    fallbackModels: [
      ...new Set(
        [...(process.env.AI_FALLBACK_MODELS ?? '').split(','), ...(aiProvider === 'gemini' ? ['gemini-2.5-flash'] : [])].map((m) => m.trim()).filter(Boolean),
      ),
    ],
  },
  storage: {
    // No Vercel o disco é somente leitura: usa Vercel Blob quando o token existe; sem ele, o banco
    driver: process.env.STORAGE_DRIVER ?? (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : process.env.VERCEL ? 'database' : 'local'),
    uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
  },
  /** Login OAuth do Google (cliente "Aplicativo da Web") para enviar a imagem das LPs ao Google Drive */
  googleOAuth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || undefined,
    /** Pasta do Drive para as imagens (id ou link); a escolhida em Configurações tem prioridade */
    folder: process.env.GOOGLE_DRIVE_FOLDER_ID || undefined,
  },
  /**
   * Envio de e-mail (formulário de contato das LPs): SMTP (ex.: Gmail com senha de app) ou Resend.
   * `from`: remetente; a resposta vai para quem preencheu o formulário (Reply-To).
   */
  mail: {
    from: process.env.MAIL_FROM || process.env.SMTP_USER || undefined,
    smtp: process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 465),
          user: process.env.SMTP_USER || undefined,
          pass: process.env.SMTP_PASS || undefined,
        }
      : null,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
  },
  /** Galeria de GIFs do WhatsApp do CRM (chave gratuita em developers.giphy.com) */
  giphyApiKey: process.env.GIPHY_API_KEY || undefined,
  /** Chave do RapidAPI usada na pesquisa de empresas (área "Buscar empresas") */
  rapidApiKey: process.env.RAPIDAPI_KEY || undefined,
  webDistDir: path.resolve(process.env.WEB_DIST_DIR ?? '../../dist/admin'),
};
