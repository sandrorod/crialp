import express, { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { getLandingPageByDomain, getLandingPageById, getLandingPageBySlug, type LandingPageRow } from '../repositories/landingPages.js';
import { getCompanyFullById } from '../repositories/companies.js';
import { publicUrl, renderFromData } from '../landing/publish.js';
import { renderUnavailablePage, INLINE_SCRIPT_HASHES } from '../landing/render.js';
import type { ContactFormStatus } from '../landing/context.js';
import { PgRateLimitStore } from '../lib/rateLimitStore.js';
import { isValidEmail, sendMail } from '../services/mail/mailer.js';

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
      // Mapa do endereço na seção de contato (Google Maps incorporado, sem chave)
      'frame-src https://www.google.com https://maps.google.com',
      `script-src ${INLINE_SCRIPT_HASHES}`,
      "base-uri 'none'",
      // Formulário de contato: envia só para o próprio sistema (também a partir de domínio personalizado)
      `form-action ${new URL(env.appUrl).origin}`,
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

const CONTACT_STATUS: ContactFormStatus[] = ['enviado', 'erro', 'invalido', 'limite'];
const contactStatus = (req: Request) => {
  const v = String(req.query.contato ?? '');
  return CONTACT_STATUS.includes(v as ContactFormStatus) ? (v as ContactFormStatus) : null;
};

async function sendLandingPage(res: Response, lp: LandingPageRow | null, req?: Request) {
  if (!lp || lp.status !== 'ativa') {
    landingPageHeaders(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send(renderUnavailablePage());
  }
  const status = req ? contactStatus(req) : null;
  const html = await renderFromData(lp, { contactStatus: status });
  landingPageHeaders(res);
  // Resultado de um envio do formulário: não indexa nem guarda a variação com ?contato=
  if (status) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
  }
  if (!html) return res.status(404).send(renderUnavailablePage());
  res.send(html);
}

export const publicRouter = Router();

/** Landing Page pública: /lp/:slug */
publicRouter.get('/lp/:slug', async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const lp = /^[a-z0-9-]{1,80}$/.test(slug) ? await getLandingPageBySlug(slug) : null;
  await sendLandingPage(res, lp, req);
});

// Formulário de contato: até 5 envios a cada 10 minutos por IP (além do campo isca contra robôs)
const contactLimiter = rateLimit({
  store: new PgRateLimitStore('lp-contact'),
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: async (req, res) => {
    const lp = /^[0-9a-f-]{36}$/i.test(String(req.params.id)) ? await getLandingPageById(String(req.params.id)).catch(() => null) : null;
    return lp ? res.redirect(303, backTo(lp, 'limite')) : res.status(429).end();
  },
});

/** Volta para a página com o resultado do envio, já na seção do formulário. */
const backTo = (lp: LandingPageRow, status: ContactFormStatus) => {
  const url = publicUrl(lp);
  return `${url}${url.includes('?') ? '&' : '?'}contato=${status}#fale-conosco`;
};

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const field = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * POST /lp/contato/:id — envio do formulário da LP para o e-mail cadastrado na empresa.
 * Toda mensagem fica guardada em lp_contact_messages (inclusive quando o e-mail falha).
 */
publicRouter.post('/lp/contato/:id', express.urlencoded({ extended: false, limit: '20kb' }), contactLimiter, async (req, res) => {
  const id = String(req.params.id);
  const lp = /^[0-9a-f-]{36}$/i.test(id) ? await getLandingPageById(id) : null;
  if (!lp || lp.status !== 'ativa') {
    landingPageHeaders(res);
    return res.status(404).send(renderUnavailablePage());
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Campo isca preenchido: robô. Responde como se tivesse enviado, sem guardar nada
  if (field(body.website, 200)) return res.redirect(303, backTo(lp, 'enviado'));
  const name = field(body.name, 120);
  const email = field(body.email, 200);
  const phone = field(body.phone, 40);
  const message = field(body.message, 3000);
  if (!name || !message || (!email && !phone) || (email && !isValidEmail(email))) return res.redirect(303, backTo(lp, 'invalido'));

  const company = await getCompanyFullById(lp.company_id);
  const recipient = company && isValidEmail(company.email) ? company.email.trim() : null;
  const companyName = company ? company.trade_name || company.name : lp.title;
  const pageUrl = publicUrl(lp);
  const result = recipient
    ? await sendMail({
        to: recipient,
        replyTo: email || null,
        subject: `Nova mensagem pelo site — ${name}`,
        text: [
          `Nova mensagem enviada pelo formulário da página ${pageUrl}`,
          '',
          `Nome: ${name}`,
          email ? `E-mail: ${email}` : null,
          phone ? `Telefone: ${phone}` : null,
          '',
          message,
        ]
          .filter((l) => l !== null)
          .join('\n'),
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
<p style="margin:0 0 12px">Nova mensagem enviada pelo formulário da página de <strong>${escapeHtml(companyName)}</strong>.</p>
<table style="border-collapse:collapse;margin:0 0 12px">
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nome</td><td style="padding:4px 0"><strong>${escapeHtml(name)}</strong></td></tr>
${email ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">E-mail</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>` : ''}
${phone ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Telefone</td><td style="padding:4px 0">${escapeHtml(phone)}</td></tr>` : ''}
</table>
<div style="white-space:pre-wrap;padding:12px 14px;background:#f3f4f6;border-radius:8px">${escapeHtml(message)}</div>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Página: <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>${email ? ' · Responda este e-mail para falar direto com a pessoa.' : ''}</p>
</div>`,
      })
    : ({ ok: false, reason: 'no_email', error: 'A empresa não tem e-mail válido cadastrado.' } as const);
  const status = result.ok ? 'sent' : result.reason;
  await query(
    `insert into lp_contact_messages (organization_id, landing_page_id, company_id, name, email, phone, message, sent_to, status, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [lp.organization_id, lp.id, lp.company_id, name, email || null, phone || null, message, recipient, status, result.ok ? null : result.error],
  );
  if (!result.ok) console.error(`[lp-contact] mensagem guardada sem envio (${status}) para a LP ${lp.id}: ${result.error}`);
  res.redirect(303, backTo(lp, result.ok ? 'enviado' : 'erro'));
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
  await sendLandingPage(res, lp, req);
}
