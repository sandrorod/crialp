import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './config/env.js';
import { blockSellers, MANAGER_ROLES, requireAuth, requireRole, requireSameOriginWrite, restrictClients } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { ADMIN_CSP, securityHeaders } from './middleware/security.js';
import { analyzeRouter } from './routes/analyze.js';
import { authRouter } from './routes/auth.js';
import { companiesRouter } from './routes/companies.js';
import { landingPagesRouter } from './routes/landingPages.js';
import { miscRouter } from './routes/misc.js';
import { googleDriveRouter } from './routes/googleDrive.js';
import { salesRouter } from './routes/sales.js';
import { crmRouter } from './routes/crm.js';
import { crmWebhookRouter } from './routes/crmWebhook.js';
import { usersRouter } from './routes/users.js';
import { clientLevelsRouter } from './routes/clientLevels.js';
import { colorPalettesRouter } from './routes/colorPalettes.js';
import { customDomainMiddleware, publicRouter } from './routes/public.js';
import { sendHomePage } from './landing/homePage.js';
import { readDbUpload } from './services/storage/StorageService.js';
import { monitoringRouter } from './routes/monitoring.js';

/** Arquivos enviados são só imagens: nunca interpretados como página nem executados se abertos direto. */
const UPLOAD_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás de proxy reverso (Caddy/Nginx) em produção

  // 1) Domínios personalizados → LP correspondente
  app.use(customDomainMiddleware);

  // 2) Arquivos enviados (imagens): no banco (sem Blob Store no Vercel) ou no disco
  app.get('/uploads/db/:file', async (req, res, next) => {
    try {
      const file = await readDbUpload(req.params.file.replace(/\.[a-z0-9]+$/i, ''));
      if (!file) return res.status(404).end();
      res.set({ ...UPLOAD_HEADERS, 'Content-Type': file.content_type, 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.send(file.data);
    } catch (err) {
      next(err);
    }
  });
  app.use(
    '/uploads',
    express.static(env.storage.uploadDir, {
      maxAge: '30d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => res.set(UPLOAD_HEADERS),
    }),
  );

  // 3) Landing Pages públicas (/lp/:slug) e verificação de domínio
  app.use(publicRouter);

  // 4) API administrativa (JSON, autenticada)
  const api = express.Router();
  api.use(securityHeaders());
  // Textos do atendimento (Configurações) podem ser grandes; o resto da API continua com 1 MB.
  // (No Vercel o corpo da requisição tem limite próprio de ~4,5 MB.)
  const jsonDefault = express.json({ limit: '1mb' });
  const jsonLarge = express.json({ limit: '4.4mb' });
  // Mídias do WhatsApp do CRM também vêm em base64 no corpo
  api.use((req, res, next) => (req.path.startsWith('/settings/atendimento') || req.path === '/crm/messages/media' ? jsonLarge : jsonDefault)(req, res, next));
  api.use(cookieParser());
  // Relatórios de erro do painel (text/plain, formato do Sentry): conferem a origem na própria rota
  api.use('/monitoring', monitoringRouter);
  api.use(requireSameOriginWrite);
  // Versão publicada (commit) para conferir se um deploy já está no ar
  api.get('/health', (_req, res) => res.json({ ok: true, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null }));
  api.use('/auth', authRouter);
  api.use('/crm-webhook', crmWebhookRouter); // eventos do WhatsApp (Evolution API), autenticados por token na URL
  api.use(requireAuth);
  api.use(restrictClients); // cliente: só o próprio site
  api.use('/sales', salesRouter); // acesso do vendedor: Vendas e CRM
  api.use('/crm', requireRole(...MANAGER_ROLES, 'seller'), crmRouter);
  api.use(blockSellers);
  api.use('/users', requireRole(...MANAGER_ROLES), usersRouter);
  api.use('/client-levels', clientLevelsRouter);
  api.use('/color-palettes', colorPalettesRouter);
  api.use('/google-drive', requireRole(...MANAGER_ROLES), googleDriveRouter);
  api.use(analyzeRouter);
  api.use('/companies', companiesRouter);
  api.use('/landing-pages', landingPagesRouter);
  api.use(miscRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use('/api', api);

  // 5) Painel administrativo (build do React) em /admin
  const webIndex = path.join(env.webDistDir, 'index.html');
  if (fs.existsSync(webIndex)) {
    app.use(securityHeaders({ csp: ADMIN_CSP }));
    app.use('/admin', express.static(env.webDistDir, { index: false, maxAge: '1h' }));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(webIndex));
    // Login do painel em /lps (mesma página do painel)
    app.get(/^\/lps\/?$/, (_req, res) => res.sendFile(webIndex));
  }
  // Página inicial do domínio do sistema (o login fica em /lps)
  app.get('/', (_req, res) => sendHomePage(res));

  app.use(errorHandler);
  return app;
}
