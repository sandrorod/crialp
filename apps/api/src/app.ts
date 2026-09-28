import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './config/env.js';
import { blockSellers, MANAGER_ROLES, requireAuth, requireRole, requireSameOriginWrite } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { ADMIN_CSP, securityHeaders } from './middleware/security.js';
import { analyzeRouter } from './routes/analyze.js';
import { authRouter } from './routes/auth.js';
import { companiesRouter } from './routes/companies.js';
import { landingPagesRouter } from './routes/landingPages.js';
import { miscRouter } from './routes/misc.js';
import { salesRouter } from './routes/sales.js';
import { usersRouter } from './routes/users.js';
import { customDomainMiddleware, publicRouter } from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás de proxy reverso (Caddy/Nginx) em produção

  // 1) Domínios personalizados → LP correspondente
  app.use(customDomainMiddleware);

  // 2) Arquivos enviados (imagens)
  app.use('/uploads', express.static(env.storage.uploadDir, { maxAge: '30d', immutable: true, index: false }));

  // 3) Landing Pages públicas (/lp/:slug) e verificação de domínio
  app.use(publicRouter);

  // 4) API administrativa (JSON, autenticada)
  const api = express.Router();
  api.use(securityHeaders());
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());
  api.use(requireSameOriginWrite);
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRouter);
  api.use(requireAuth);
  api.use('/sales', salesRouter); // único acesso do vendedor
  api.use(blockSellers);
  api.use('/users', requireRole(...MANAGER_ROLES), usersRouter);
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
    app.get('/', (_req, res) => res.redirect('/admin'));
  } else if (process.env.VERCEL) {
    // No Vercel o painel é servido como estático em /admin
    app.get('/', (_req, res) => res.redirect('/admin'));
  } else {
    app.get('/', (_req, res) => res.type('text').send('API LP em execução. Painel: rode "npm run dev:web" e acesse http://localhost:5173/admin'));
  }

  app.use(errorHandler);
  return app;
}
