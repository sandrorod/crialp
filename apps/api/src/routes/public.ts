import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { getLandingPageByDomain, getLandingPageBySlug, type LandingPageRow } from '../repositories/landingPages.js';
import { renderFromData } from '../landing/publish.js';
import { renderUnavailablePage, REVEAL_SCRIPT_HASH } from '../landing/render.js';

/** Cabeçalhos das páginas públicas: CSP restritiva, cache amigável a CDN. */
export function landingPageHeaders(res: Response, opts: { preview?: boolean } = {}) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "img-src 'self' https: data:",
      "style-src 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      `script-src ${REVEAL_SCRIPT_HASH}`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Sempre confere com o servidor: depois de salvar no editor, o link já mostra a versão nova
  // (com cópia guardada, um "salvei e não mudou" aparecia por até 6 minutos). A ETag evita baixar de novo o que não mudou.
  res.setHeader('Cache-Control', opts.preview ? 'no-store' : 'no-cache');
  if (opts.preview) res.setHeader('X-Robots-Tag', 'noindex');
}

async function sendLandingPage(res: Response, lp: LandingPageRow | null) {
  if (!lp || lp.status !== 'ativa') {
    landingPageHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send(renderUnavailablePage());
  }
  const html = await renderFromData(lp);
  landingPageHeaders(res);
  if (!html) return res.status(404).send(renderUnavailablePage());
  res.send(html);
}

export const publicRouter = Router();

/** Landing Page pública: /lp/:slug */
publicRouter.get('/lp/:slug', async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const lp = /^[a-z0-9-]{1,80}$/.test(slug) ? await getLandingPageBySlug(slug) : null;
  await sendLandingPage(res, lp);
});

/**
 * Endpoint consultado pelo proxy reverso (Caddy "on_demand_tls ask") antes de
 * emitir certificado HTTPS para um domínio personalizado.
 */
publicRouter.get('/api/domains/check', async (req, res) => {
  const domain = String(req.query.domain ?? '').toLowerCase();
  const lp = domain ? await getLandingPageByDomain(domain) : null;
  res.status(lp && lp.status === 'ativa' ? 200 : 404).end();
});

/**
 * Domínio personalizado: requisições com Host diferente do sistema são
 * atendidas diretamente pela LP vinculada (empresa.com.br → LP da empresa).
 */
export async function customDomainMiddleware(req: Request, res: Response, next: NextFunction) {
  const host = (req.hostname ?? '').toLowerCase();
  if (!host || env.isSystemHost(host)) return next();
  if (req.path.startsWith('/uploads/')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  if (req.path !== '/') return res.redirect(301, '/');
  const lp = await getLandingPageByDomain(host);
  await sendLandingPage(res, lp);
}
