import dns from 'node:dns/promises';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError, notFound } from '../lib/errors.js';
import { isValidSlug } from '../lib/slug.js';
import { parseBody, safeUrl, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { getCompanyFull } from '../repositories/companies.js';
import * as repo from '../repositories/landingPages.js';
import { LandingContentEditSchema, type LandingContent } from '../services/ai/schemas.js';
import { DEFAULT_LABELS } from '../landing/labels.js';
import { normalizeThemeSettings, PRESETS } from '../landing/theme.js';
import { publicUrl, refreshSnapshot, renderFromData } from '../landing/publish.js';
import { renderUnavailablePage } from '../landing/render.js';
import { landingPageHeaders } from './public.js';

export const landingPagesRouter = Router();

async function loadOr404(orgId: string, rawId: string) {
  const lp = await repo.getLandingPage(orgId, uuidParam.parse(rawId));
  if (!lp) throw notFound('Landing Page não encontrada.');
  return lp;
}

function serialize(lp: repo.LandingPageRow) {
  const { html_content: _html, ...rest } = lp;
  return { ...rest, public_url: publicUrl(lp), path_url: `${env.appUrl}/lp/${lp.slug}` };
}

landingPagesRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const q = z.object({ search: z.string().max(200).optional(), status: z.string().max(20).optional() }).parse(req.query);
  const items = await repo.listLandingPages(user.organizationId, q);
  res.json({ items: items.map((i) => ({ ...i, public_url: publicUrl(i) })) });
});

landingPagesRouter.get('/labels', (_req, res) => {
  res.json(DEFAULT_LABELS);
});

landingPagesRouter.get('/presets', (_req, res) => {
  res.json(
    Object.entries(PRESETS).map(([key, p]) => ({
      key,
      label: p.label,
      primary: p.colors.primary,
      accent: p.colors.accent,
      bg: p.colors.bg,
      heading: p.heading.family,
      heroDefault: p.heroDefault,
    })),
  );
});

landingPagesRouter.get('/:id', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const company = await getCompanyFull(user.organizationId, lp.company_id);
  res.json({
    ...serialize(lp),
    company: company && { id: company.id, name: company.name, segment: company.segment, testimonials: company.testimonials.length, images_allowed: company.images.filter((i) => i.usage_allowed).length },
    versions: await repo.listVersions(lp.id),
  });
});

/** Prévia (funciona mesmo com a página inativa; exige login). */
landingPagesRouter.get('/:id/preview', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const html = await renderFromData(lp);
  landingPageHeaders(res, { preview: true });
  res.status(html ? 200 : 404).send(html ?? renderUnavailablePage());
});

/** Exporta o HTML estático (para hospedagem externa). */
landingPagesRouter.get('/:id/export', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const html = (await refreshSnapshot(lp)) ?? '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${lp.slug}.html"`);
  res.send(html);
});

const ContentUpdateSchema = z.object({
  content: LandingContentEditSchema,
  theme: z.object({
    preset: z.string(),
    primary: z.string().nullish(),
    accent: z.string().nullish(),
    heroVariant: z.enum(['split', 'centered', 'image']).optional(),
    // Cores por seção: { "services": { "bg": "#0b1b2b", "text": null, "accent": "#ffcc00" }, ... }
    sections: z
      .record(
        z.string().max(60),
        z.object({ bg: z.string().max(9).nullish(), text: z.string().max(9).nullish(), accent: z.string().max(9).nullish() }),
      )
      .optional(),
  }),
  seo: z.object({
    seo_title: z.string().trim().max(120).nullish().transform((v) => v || null),
    seo_description: z.string().trim().max(320).nullish().transform((v) => v || null),
    seo_keywords: z.array(z.string().trim().max(80)).max(20).default([]),
    og_image: safeUrl,
  }),
  note: z.string().max(200).optional(),
});

/** Edição manual de textos/cores/SEO — sempre gera uma nova versão. */
landingPagesRouter.put('/:id/content', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const body = parseBody(ContentUpdateSchema, req.body);
  await repo.saveVersion({
    id: lp.id,
    orgId: user.organizationId,
    userId: user.id,
    content: body.content as LandingContent,
    theme: normalizeThemeSettings(body.theme),
    seo: body.seo,
    note: body.note || 'Edição manual',
  });
  const updated = (await repo.getLandingPage(user.organizationId, lp.id))!;
  await refreshSnapshot(updated);
  res.json(serialize(updated));
});

landingPagesRouter.post('/:id/versions/:version/restore', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const version = z.coerce.number().int().positive().parse(req.params.version);
  const v = await repo.getVersion(lp.id, version);
  if (!v) throw notFound('Versão não encontrada.');
  await repo.saveVersion({
    id: lp.id,
    orgId: user.organizationId,
    userId: user.id,
    content: v.content.content,
    theme: v.content.theme,
    seo: v.content.seo,
    note: `Restaurada a partir da versão ${version}`,
  });
  const updated = (await repo.getLandingPage(user.organizationId, lp.id))!;
  await refreshSnapshot(updated);
  res.json(serialize(updated));
});

landingPagesRouter.patch('/:id/status', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const { status } = parseBody(z.object({ status: z.enum(['ativa', 'inativa']) }), req.body);
  const updated = await repo.setStatus(user.organizationId, lp.id, status);
  res.json(serialize(updated!));
});

/** Publicar = ativar a página e gerar o snapshot final. */
landingPagesRouter.post('/:id/publish', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const updated = (await repo.setStatus(user.organizationId, lp.id, 'ativa'))!;
  await refreshSnapshot(updated);
  res.json(serialize(updated));
});

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

landingPagesRouter.patch('/:id/settings', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const body = parseBody(
    z.object({
      slug: z.string().trim().toLowerCase().optional(),
      custom_domain: z
        .string()
        .trim()
        .toLowerCase()
        .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .nullish(),
    }),
    req.body,
  );
  if (body.slug !== undefined && body.slug !== lp.slug) {
    if (!isValidSlug(body.slug)) throw new AppError(400, 'Endereço inválido: use apenas letras minúsculas, números e hífens.');
    if (await repo.getLandingPageBySlug(body.slug)) throw new AppError(409, 'Este endereço já está em uso.');
  }
  let domain: string | null | undefined = body.custom_domain === undefined ? undefined : body.custom_domain || null;
  if (domain) {
    if (!DOMAIN_RE.test(domain)) throw new AppError(400, 'Domínio inválido. Exemplo: www.empresa.com.br');
    if (env.isSystemHost(domain)) throw new AppError(400, 'Este domínio pertence ao próprio sistema.');
  }
  const updated = await repo.updateSettings(user.organizationId, lp.id, { slug: body.slug, custom_domain: domain });
  await refreshSnapshot(updated!);
  res.json(serialize(updated!));
});

/**
 * Verifica se o DNS do domínio personalizado aponta para este servidor.
 * O certificado HTTPS é emitido pelo proxy reverso (ex.: Caddy on-demand TLS),
 * que consulta GET /api/domains/check antes de emitir.
 */
landingPagesRouter.post('/:id/domain/verify', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  if (!lp.custom_domain) throw new AppError(400, 'Nenhum domínio configurado.');
  const appHost = new URL(env.appUrl).hostname;
  const [domainIps, appIps, cname] = await Promise.all([
    dns.resolve4(lp.custom_domain).catch(() => [] as string[]),
    dns.resolve4(appHost).catch(() => [] as string[]),
    dns.resolveCname(lp.custom_domain).catch(() => [] as string[]),
  ]);
  const ok = cname.some((c) => c.replace(/\.$/, '') === appHost) || (domainIps.length > 0 && domainIps.some((ip) => appIps.includes(ip)));
  const updated = await repo.updateDomainStatus(user.organizationId, lp.id, ok ? 'verified' : 'error', ok ? 'pending' : 'none');
  res.json({
    ...serialize(updated!),
    verification: {
      ok,
      expected: { cname: appHost, a: appIps },
      found: { cname, a: domainIps },
    },
  });
});

landingPagesRouter.delete('/:id', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  await repo.deleteLandingPage(user.organizationId, lp.id);
  res.json({ ok: true });
});
