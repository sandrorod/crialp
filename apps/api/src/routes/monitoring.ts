import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PgRateLimitStore } from '../lib/rateLimitStore.js';
import { isTrustedOrigin } from '../middleware/auth.js';

/**
 * Túnel do Sentry para o painel (POST /api/monitoring): o navegador manda os relatórios de erro para a
 * própria API, que repassa ao Sentry. Assim a CSP do painel continua só com 'self' e bloqueadores de
 * anúncio não somem com os erros. Só aceita envios do próprio painel (Origin) e só repassa para o projeto
 * do DSN configurado (não vira proxy aberto). Fica antes da proteção de CSRF geral, que só aceita JSON.
 */
export const monitoringRouter = Router();

const tunnelLimiter = rateLimit({
  store: new PgRateLimitStore('monitoring'),
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Relatórios demais. Tente mais tarde.' },
});

/** DSN do painel (VITE_SENTRY_DSN no build) — o mesmo projeto da API ou um próprio em SENTRY_DSN_WEB. */
function allowedDsn(): URL | null {
  const raw = process.env.SENTRY_DSN_WEB || process.env.SENTRY_DSN;
  try {
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

monitoringRouter.post('/', tunnelLimiter, express.text({ type: '*/*', limit: '512kb' }), async (req, res) => {
  const source = req.headers.origin ?? req.headers.referer;
  if (source !== undefined && !isTrustedOrigin(source)) return res.status(403).json({ error: 'Requisição não permitida.' });
  const allowed = allowedDsn();
  if (!allowed) return res.status(404).end();
  const envelope = typeof req.body === 'string' ? req.body : '';
  let dsn: URL;
  try {
    dsn = new URL(JSON.parse(envelope.slice(0, envelope.indexOf('\n'))).dsn);
  } catch {
    return res.status(400).json({ error: 'Relatório inválido.' });
  }
  const project = dsn.pathname.replace(/\//g, '');
  if (dsn.host !== allowed.host || project !== allowed.pathname.replace(/\//g, '') || !/^\d+$/.test(project)) {
    return res.status(403).json({ error: 'Projeto não permitido.' });
  }
  try {
    const r = await fetch(`https://${dsn.host}/api/${project}/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      signal: AbortSignal.timeout(10_000),
    });
    res.status(r.status).end();
  } catch {
    res.status(502).end();
  }
});
