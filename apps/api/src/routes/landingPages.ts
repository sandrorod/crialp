import dns from 'node:dns/promises';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError, notFound } from '../lib/errors.js';
import { isValidSlug } from '../lib/slug.js';
import { parseBody, safeUrl, uuidParam } from '../lib/validation.js';
import { one, query } from '../db/pool.js';
import { authUser, MANAGER_ROLES, requireRole } from '../middleware/auth.js';
import { ICON_CATEGORIES, iconSvg, PICKABLE_ICONS } from '../landing/icons.js';
import rateLimit from 'express-rate-limit';
import { getCompanyFull } from '../repositories/companies.js';
import { PgRateLimitStore } from '../lib/rateLimitStore.js';
import { ensureGoogleReviews } from '../services/pipeline/generateLanding.js';
import * as repo from '../repositories/landingPages.js';
import { LandingContentEditSchema, type LandingContent } from '../services/ai/schemas.js';
import { DEFAULT_LABELS } from '../landing/labels.js';
import { TEXT_EFFECTS } from '../landing/elementColors.js';
import {
  CUSTOM_PLACEMENT,
  HEADING_FAMILY,
  PHOTO_SHAPES,
  IMAGE_PLACEMENTS,
  normalizeThemeSettings,
  PRESETS,
  SECTION_PLACEMENT,
  TEMPLATE_KEYS,
  TEMPLATES,
} from '../landing/theme.js';
import { publicUrl, refreshSnapshot, renderFromData } from '../landing/publish.js';
import { renderUnavailablePage } from '../landing/render.js';
import { IMAGE_FILTERS, IMAGE_SHADOWS } from '../landing/imageStyle.js';
import { landingPageHeaders } from './public.js';
import { generateScreenshot, getScreenshotImage, getScreenshotInfo } from '../services/screenshot/ScreenshotService.js';
import { mailConfigured } from '../services/mail/mailer.js';
import { addProjectDomain, domainConfig, expectedRecords, removeProjectDomain, VERCEL_A, vercelConfigured } from '../services/vercelDomains.js';

export const landingPagesRouter = Router();

async function loadOr404(orgId: string, rawId: string) {
  const lp = await repo.getLandingPage(orgId, uuidParam.parse(rawId));
  if (!lp) throw notFound('Landing Page não encontrada.');
  return lp;
}

function serialize(lp: repo.LandingPageRow) {
  const { html_content: _html, ...rest } = lp;
  return {
    ...rest,
    theme: normalizeThemeSettings(lp.theme),
    public_url: publicUrl(lp),
    path_url: `${env.appUrl}/lp/${lp.slug}`,
    // Formulário de contato: o servidor tem SMTP/Resend para enviar as mensagens?
    mail_configured: mailConfigured(),
    // Domínio próprio: registro de DNS a criar (A com o IP da Vercel na raiz; CNAME no www/subdomínio)
    domain_record: lp.custom_domain ? expectedRecords(lp.custom_domain) : null,
    vercel_domains: vercelConfigured(),
  };
}

landingPagesRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const q = z
    .object({
      search: z.string().max(200).optional(),
      status: z.string().max(20).optional(),
      segment: z.string().max(200).optional(),
      wp: z.enum(['com', 'sem']).optional().catch(undefined),
      edicao: z.enum(['editar', 'pronta']).optional().catch(undefined),
    })
    .parse(req.query);
  const [items, segments] = await Promise.all([repo.listLandingPages(user.organizationId, q), repo.landingPageSegments(user.organizationId)]);
  res.json({ items: items.map((i) => ({ ...i, public_url: publicUrl(i) })), facets: { segments } });
});

landingPagesRouter.get('/labels', (_req, res) => {
  res.json(DEFAULT_LABELS);
});

landingPagesRouter.get('/templates', (_req, res) => {
  res.json(Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, description: t.description, hero: t.hero })));
});

landingPagesRouter.get('/presets', (_req, res) => {
  res.json(
    Object.entries(PRESETS).map(([key, p]) => ({
      key,
      label: p.label,
      primary: p.colors.primary,
      accent: p.colors.accent,
      bg: p.colors.bg,
      heading: `${HEADING_FAMILY} + ${p.body.family}`,
      heroDefault: p.heroDefault,
    })),
  );
});

/** Ícones para os elementos das seções personalizadas: { nome: svg } */
landingPagesRouter.get('/icons', (_req, res) => {
  res.json(Object.fromEntries(PICKABLE_ICONS.map((name) => [name, iconSvg(name, 22)])));
});

/** Grupos do seletor de ícones: [{ label, icons: [nome] }] */
landingPagesRouter.get('/icon-categories', (_req, res) => {
  res.json(ICON_CATEGORIES);
});

landingPagesRouter.get('/:id', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const company = await getCompanyFull(user.organizationId, lp.company_id);
  res.json({
    ...serialize(lp),
    company: company && {
      id: company.id,
      name: company.name,
      segment: company.segment,
      testimonials: company.testimonials.length,
      images_allowed: company.images.filter((i) => i.usage_allowed).length,
    },
    versions: await repo.listVersions(lp.id),
    screenshot: await getScreenshotInfo(lp.id),
    seller_name: lp.seller_id ? ((await one<{ name: string }>('select name from users where id = $1', [lp.seller_id]))?.name ?? null) : null,
  });
});

// Cada busca gasta consultas do RapidAPI
const reviewsLimiter = rateLimit({
  store: new PgRateLimitStore('reviews'),
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas buscas de avaliações. Aguarde alguns minutos.' },
});

/** "Buscar avaliações agora" no editor: busca as avaliações do Google da empresa e atualiza a página. */
landingPagesRouter.post('/:id/google-reviews', reviewsLimiter, async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, String(req.params.id));
  const company = await getCompanyFull(user.organizationId, lp.company_id);
  if (!company) throw notFound('Empresa não encontrada.');
  const reviews = await ensureGoogleReviews(company, true);
  await refreshSnapshot(lp);
  res.json({ count: reviews?.items.length ?? 0, error: reviews?.error ?? null, rating: reviews?.rating ?? null, total: reviews?.total ?? null });
});

/** Prévia (funciona mesmo com a página inativa; exige login). */
landingPagesRouter.get('/:id/preview', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const html = await renderFromData(lp, { editable: true });
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

/** Baixa a imagem (JPG) da página (3 primeiras seções). */
landingPagesRouter.get('/:id/screenshot', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const image = await getScreenshotImage(lp.id);
  if (!image) throw notFound('Imagem da página ainda não gerada.');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${lp.company_id}.jpg"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(image);
});

/** Gera a imagem de novo (ex.: depois de editar a página). */
landingPagesRouter.post('/:id/screenshot', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const info = await generateScreenshot(lp);
  if (!info?.available || info.error) throw new AppError(502, info?.error ?? 'Não foi possível gerar a imagem da página.');
  res.json({ screenshot: info });
});

// Cor, tamanho e estilo do texto de um elemento clicado na prévia
const ImageBoxSchema = z.object({
  w: z.number().min(0).max(100).optional(),
  h: z.number().min(0).max(5000).optional(),
  // Corte pelas laterais: tamanho da foto e parte escondida à esquerda / em cima
  iw: z.number().min(0).max(1000).optional(),
  il: z.number().min(0).max(1000).optional(),
  ih: z.number().min(0).max(20000).optional(),
  it: z.number().min(0).max(20000).optional(),
});
const ElementStyleSchema = z.object({
  text: z.string().max(9).nullish(),
  bg: z.string().max(9).nullish(),
  size: z.number().min(6).max(200).nullish(),
  font: z.string().max(40).nullish(),
  bold: z.boolean().nullish(),
  italic: z.boolean().nullish(),
  underline: z.boolean().nullish(),
  // Efeito de movimento quando o texto aparece na tela
  fx: z.enum(TEXT_EFFECTS).nullish(),
  // Elemento excluído da página pelo editor
  hidden: z.boolean().nullish(),
  // Velocidade do efeito (0 a 2x)
  fxSpeed: z.number().min(0).max(2).nullish(),
  // Posição arrastada no modo "Mover" (px)
  mx: z.number().min(-3000).max(3000).nullish(),
  my: z.number().min(-3000).max(3000).nullish(),
  // Largura do bloco arrastada na prévia (% da área) e se fica centralizado
  w: z.number().min(0).max(400).nullish(),
  wc: z.boolean().nullish(),
  // Link externo do elemento (botão, emoji/ícone) e se abre em nova aba
  href: z.string().max(2048).nullish(),
  nt: z.boolean().nullish(),
});

const ContentUpdateSchema = z.object({
  content: LandingContentEditSchema,
  theme: z.object({
    preset: z.string(),
    primary: z.string().nullish(),
    accent: z.string().nullish(),
    // Cor de fundo da página (3ª cor do modelo); ausente = a do estilo
    background: z.string().max(9).nullish(),
    heroVariant: z.enum(['split', 'centered', 'image']).optional(), // "image" é legado: vira "split"
    // Cores por seção: { "services": { "bg": "#0b1b2b", "text": null, "accent": "#ffcc00" }, ... }
    sections: z
      .record(z.string().max(60), z.object({ bg: z.string().max(9).nullish(), text: z.string().max(9).nullish(), accent: z.string().max(9).nullish() }))
      .optional(),
    // Local de cada foto: { "<url>": "hero" | "about" | "gallery" | "hidden" | "logo" | "custom:<id>" }; ausente = automático
    images: z
      .record(z.string().max(2048), z.union([z.enum(IMAGE_PLACEMENTS), z.string().regex(CUSTOM_PLACEMENT), z.string().regex(SECTION_PLACEMENT)]))
      .optional(),
    template: z.enum(TEMPLATE_KEYS).optional(),
    // Ponto de corte das fotos do topo/"sobre": { "<url>": { "x": 0-100, "y": 0-100 } }
    focus: z
      .record(z.string().max(2048), z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), z: z.number().min(0.1).max(3).optional() }))
      .optional(),
    imageOrder: z.array(z.string().max(2048)).max(300).optional(),
    // Onde o logotipo aparece: cabeçalho, início do conteúdo ou seção "Sobre"
    logoPlacement: z.enum(['header', 'hero', 'about']).optional(),
    // Cabeçalho: logotipo, nome da empresa ou os dois
    brand: z.enum(['logo', 'name', 'both']).optional(),
    // Tira os emojis de todos os textos da página
    removeEmojis: z.boolean().optional(),
    // Tons das duas cores (gravado ao escolher as cores no editor)
    blend: z.boolean().optional(),
    hideMap: z.boolean().optional(),
    // Formato das fotos: quadradas ou horizontais (ausente = do modelo)
    photoShape: z.enum(PHOTO_SHAPES).optional(),
    // Fotos por linha (2 a 5; ausente = do modelo)
    photoCols: z.number().int().min(2).max(5).optional(),
    // Ordem das seções só no celular (vazia = igual ao computador)
    mobileOrder: z.array(z.string().max(60)).max(60).optional(),
    // Cores e estilo do texto de elementos clicados na prévia: { desktop: { "<seletor>": { text, bg, size, font, bold, italic, underline } }, mobile: {...} }
    elementColors: z
      .object({
        desktop: z.record(z.string().max(600), ElementStyleSchema).optional(),
        mobile: z.record(z.string().max(600), ElementStyleSchema).optional(),
      })
      .optional(),
    // Margem interna das seções em % do padrão: { desktop: 20-100, mobile: 20-100 }
    sectionSpacing: z
      .object({
        desktop: z.number().min(0).max(100).nullish(),
        mobile: z.number().min(0).max(100).nullish(),
        // Espaço próprio de cada seção, arrastado na prévia: { desktop: { "about": 60 }, mobile: {...} }
        sections: z
          .object({
            desktop: z.record(z.string().max(60), z.number().min(0).max(150)).optional(),
            mobile: z.record(z.string().max(60), z.number().min(0).max(150)).optional(),
          })
          .optional(),
        // Largura dos títulos e dos textos (% da área), por layout
        titleWidth: z.object({ desktop: z.number().min(0).max(100).nullish(), mobile: z.number().min(0).max(100).nullish() }).optional(),
        textWidth: z.object({ desktop: z.number().min(0).max(100).nullish(), mobile: z.number().min(0).max(100).nullish() }).optional(),
      })
      .optional(),
    // Tamanho das fotos arrastado na prévia: { desktop: { "<url>": { w: 20-100 (%), h: 80-1400 (px) } }, mobile: {...} }
    // Borda, cantos, sombra, filtro, giro, espelhamento e link de cada foto: { "<url>": { bw, bc, r, sh, fx, rot, fh, fv, href, nt, lb } }
    imageStyle: z
      .record(
        z.string().max(2048),
        z.object({
          bw: z.number().min(0).max(40).optional(),
          bc: z.string().max(9).optional(),
          r: z.number().min(0).max(300).optional(),
          sh: z.enum(IMAGE_SHADOWS).optional(),
          fx: z.enum(IMAGE_FILTERS).optional(),
          // Giro (90° em 90°) e espelhamento horizontal/vertical
          rot: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
          fh: z.literal(true).optional(),
          fv: z.literal(true).optional(),
          // Link ao clicar na foto, nova aba e borda indicando o link
          href: z.string().max(2048).optional(),
          nt: z.literal(true).optional(),
          lb: z.literal(true).optional(),
        }),
      )
      .optional(),
    imageSize: z
      .object({
        desktop: z.record(z.string().max(2120), ImageBoxSchema).optional(),
        mobile: z.record(z.string().max(2120), ImageBoxSchema).optional(),
      })
      .optional(),
  }),
  seo: z.object({
    seo_title: z
      .string()
      .trim()
      .max(120)
      .nullish()
      .transform((v) => v || null),
    seo_description: z
      .string()
      .trim()
      .max(320)
      .nullish()
      .transform((v) => v || null),
    seo_keywords: z.array(z.string().trim().max(80)).max(20).default([]),
    og_image: safeUrl,
  }),
  note: z.string().max(200).optional(),
});

/** Prévia do rascunho (conteúdo e tema ainda não salvos), para o editor mostrar as mudanças na hora. */
landingPagesRouter.post('/:id/preview', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const body = parseBody(ContentUpdateSchema.pick({ content: true, theme: true }), req.body);
  const html = await renderFromData({ ...lp, content: body.content as LandingContent, theme: normalizeThemeSettings(body.theme) }, { editable: true });
  if (!html) throw notFound('Empresa não encontrada.');
  res.json({ html });
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
  const updated = (await repo.setStatus(user.organizationId, lp.id, status))!;
  // Ao ativar: print das 3 primeiras seções (enviado ao Google Drive)
  const screenshot = status === 'ativa' && lp.status !== 'ativa' ? await generateScreenshot(updated) : null;
  res.json({ ...serialize(updated), screenshot });
});

/** Andamento da edição: "editar" (padrão) ou "pronta" (a equipe, como o ativar/desativar). */
landingPagesRouter.patch('/:id/edit-status', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const { edit_status } = parseBody(z.object({ edit_status: z.enum(['editar', 'pronta']) }), req.body);
  res.json(serialize((await repo.setEditStatus(user.organizationId, lp.id, edit_status))!));
});

/** Troca manual do vendedor responsável (só administradores). */
landingPagesRouter.patch('/:id/seller', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, uuidParam.parse(req.params.id));
  const { seller_id } = parseBody(z.object({ seller_id: uuidParam.nullable() }), req.body);
  if (!(await repo.setSeller(user.organizationId, lp.id, seller_id))) throw new AppError(400, 'Escolha um vendedor válido.');
  res.json({ ok: true });
});

/** Troca do nível de cliente da página (só administradores). */
landingPagesRouter.patch('/:id/client-level', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, uuidParam.parse(req.params.id));
  const { client_level_id } = parseBody(z.object({ client_level_id: uuidParam.nullable() }), req.body);
  if (!(await repo.setClientLevel(user.organizationId, lp.id, client_level_id))) throw new AppError(400, 'Escolha um nível válido.');
  res.json({ ok: true });
});

/** Publicar = ativar a página e gerar o snapshot final. */
landingPagesRouter.post('/:id/publish', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const updated = (await repo.setStatus(user.organizationId, lp.id, 'ativa'))!;
  await refreshSnapshot(updated);
  const screenshot = lp.status !== 'ativa' ? await generateScreenshot(updated) : null;
  res.json({ ...serialize(updated), screenshot });
});

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

/** Aba Publicação: o endereço digitado está livre? (validação enquanto o usuário digita) */
landingPagesRouter.get('/:id/slug-check', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  const slug = z.string().trim().toLowerCase().max(200).catch('').parse(req.query.slug);
  if (slug === lp.slug) return res.json({ available: true, error: null });
  if (!slug) return res.json({ available: false, error: 'Informe o endereço da página.' });
  if (!isValidSlug(slug)) return res.json({ available: false, error: 'Endereço inválido: use apenas letras minúsculas, números e hífens.' });
  const other = await repo.getLandingPageBySlug(slug);
  res.json({ available: !other, error: other ? 'Este endereço já está em uso por outro site.' : null });
});

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
  // Conta de cliente só troca o endereço da página; domínio personalizado fica com a equipe
  if ((user.role === 'client' || user.role === 'seller') && body.custom_domain !== undefined)
    throw new AppError(403, 'Você não tem permissão para alterar o domínio.', 'FORBIDDEN');
  if (body.slug !== undefined && body.slug !== lp.slug) {
    if (!isValidSlug(body.slug)) throw new AppError(400, 'Endereço inválido: use apenas letras minúsculas, números e hífens.');
    if (await repo.getLandingPageBySlug(body.slug)) throw new AppError(409, 'Este endereço já está em uso.');
  }
  const domain: string | null | undefined = body.custom_domain === undefined ? undefined : body.custom_domain || null;
  if (domain) {
    if (!DOMAIN_RE.test(domain)) throw new AppError(400, 'Domínio inválido. Exemplo: www.empresa.com.br');
    if (env.isSystemHost(domain)) throw new AppError(400, 'Este domínio pertence ao próprio sistema.');
  }
  const updated = await repo.updateSettings(user.organizationId, lp.id, { slug: body.slug, custom_domain: domain });
  await refreshSnapshot(updated!);
  // Na Vercel o domínio precisa estar no projeto: tira o antigo e adiciona o novo
  let vercel_error: string | null = null;
  if (domain !== undefined && domain !== lp.custom_domain) {
    if (lp.custom_domain) await removeProjectDomain(lp.custom_domain).catch(() => {});
    if (domain) vercel_error = await addProjectDomain(domain).catch(() => 'A Vercel não respondeu ao adicionar o domínio.');
  }
  res.json({ ...serialize(updated!), vercel_error });
});

/**
 * Verifica o domínio próprio. Na Vercel: garante o domínio no projeto e pergunta a ela se o DNS está certo
 * (o HTTPS sai sozinho). Sem o token, confere o DNS: raiz com A para o IP da Vercel; www com CNAME para ela.
 */
landingPagesRouter.post('/:id/domain/verify', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  if (!lp.custom_domain) throw new AppError(400, 'Nenhum domínio configurado.');
  const appHost = new URL(env.appUrl).hostname;
  const vercelError = await addProjectDomain(lp.custom_domain).catch(() => 'A Vercel não respondeu ao adicionar o domínio.');
  const vercel = vercelError ? null : await domainConfig(lp.custom_domain).catch(() => null);
  const [domainIps, appIps, cname] = await Promise.all([
    dns.resolve4(lp.custom_domain).catch(() => [] as string[]),
    dns.resolve4(appHost).catch(() => [] as string[]),
    dns.resolveCname(lp.custom_domain).catch(() => [] as string[]),
  ]);
  const expected = expectedRecords(lp.custom_domain, vercel ?? undefined);
  const cnameOk = cname.some((c) => {
    const host = c.replace(/\.$/, '');
    return host === appHost || host === expected.value || host.endsWith('.vercel-dns.com');
  });
  const aOk = domainIps.some((ip) => ip === expected.value || ip === VERCEL_A || appIps.includes(ip));
  const ok = vercel ? vercel.ok : cnameOk || aOk;
  const updated = await repo.updateDomainStatus(user.organizationId, lp.id, ok ? 'verified' : 'error', ok ? 'pending' : 'none');
  res.json({
    ...serialize(updated!),
    verification: { ok, expected, found: { cname, a: domainIps }, vercel_error: vercelError },
  });
});

landingPagesRouter.delete('/:id', async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, req.params.id);
  await repo.deleteLandingPage(user.organizationId, lp.id);
  // Cliente que só tinha esta página perde a conta
  await deleteOrphanClients();
  res.json({ ok: true });
});

// ─── Acesso do cliente (login que edita esta e as outras Landing Pages do mesmo e-mail) ──────
const CLIENT_COLUMNS = 'u.id, u.name, u.email, u.last_login_at, u.created_at';

async function findClient(lpId: string) {
  const client = await one<{ id: string; name: string; email: string; last_login_at: string | null; created_at: string }>(
    `select ${CLIENT_COLUMNS} from lp_client_pages cp join users u on u.id = cp.user_id
      where cp.landing_page_id = $1 and u.role = 'client' order by cp.created_at limit 1`,
    [lpId],
  );
  if (!client) return null;
  // Outros sites que o mesmo e-mail acessa (o cliente escolhe qual editar ao entrar)
  const { rows: others } = await query<{ id: string; title: string }>(
    `select lp.id, lp.title from lp_client_pages cp join landing_pages lp on lp.id = cp.landing_page_id
      where cp.user_id = $1 and cp.landing_page_id <> $2 order by lp.title`,
    [client.id, lpId],
  );
  return { ...client, other_sites: others };
}

/** Conta de cliente sem nenhum site ligado não tem mais o que acessar: é excluída. */
const deleteOrphanClients = () =>
  query(`delete from users u where u.role = 'client' and not exists (select 1 from lp_client_pages cp where cp.user_id = u.id)`);

landingPagesRouter.get('/:id/client-access', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, String(req.params.id));
  res.json({ client: await findClient(lp.id) });
});

const ClientAccessSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(200),
  // Obrigatória ao criar a conta; ao editar ou ligar a uma conta existente, vazia mantém a senha atual
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(200).optional(),
});

/**
 * Cria ou altera o acesso do cliente. E-mail que já é de uma conta de cliente: o site é ligado a ela
 * (o mesmo login passa a editar os dois; a senha é a da conta). E-mail novo: altera a conta deste site
 * se ela só tiver este site; senão cria outra conta (as demais páginas continuam com o e-mail antigo).
 */
landingPagesRouter.put('/:id/client-access', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, String(req.params.id));
  const body = parseBody(ClientAccessSchema, req.body);
  const current = await findClient(lp.id);
  const taken = await one<{ id: string; role: string; organization_id: string }>('select id, role, organization_id from users where lower(email) = $1', [
    body.email,
  ]);
  if (taken && (taken.role !== 'client' || taken.organization_id !== user.organizationId)) {
    throw new AppError(409, 'Este e-mail já é de uma conta da equipe (não de cliente). Use outro e-mail.', 'CONFLICT');
  }
  const hash = body.password ? await bcrypt.hash(body.password, 12) : null;

  if (taken) {
    // Conta de cliente existente (deste ou de outro site): liga este site a ela
    await query('insert into lp_client_pages (user_id, landing_page_id) values ($1, $2) on conflict do nothing', [taken.id, lp.id]);
    await query('update users set name = coalesce($2, name), password_hash = coalesce($3, password_hash) where id = $1', [taken.id, body.name || null, hash]);
    if (current && current.id !== taken.id) {
      await query('delete from lp_client_pages where user_id = $1 and landing_page_id = $2', [current.id, lp.id]);
      await deleteOrphanClients();
    }
  } else if (current && !current.other_sites.length) {
    // E-mail novo e a conta só tem este site: troca o e-mail dela
    await query('update users set name = coalesce($2, name), email = $3, password_hash = coalesce($4, password_hash) where id = $1', [
      current.id,
      body.name || null,
      body.email,
      hash,
    ]);
  } else {
    if (!hash) throw new AppError(400, 'Defina uma senha para o cliente.');
    const created = await one<{ id: string }>(
      `insert into users (organization_id, name, email, password_hash, role) values ($1, $2, $3, $4, 'client') returning id`,
      [user.organizationId, body.name || lp.title, body.email, hash],
    );
    await query('insert into lp_client_pages (user_id, landing_page_id) values ($1, $2)', [created!.id, lp.id]);
    if (current) await query('delete from lp_client_pages where user_id = $1 and landing_page_id = $2', [current.id, lp.id]);
  }
  res.json({ client: await findClient(lp.id) });
});

/** Tira o acesso do cliente a este site (a conta continua se tiver outros sites). */
landingPagesRouter.delete('/:id/client-access', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const lp = await loadOr404(user.organizationId, String(req.params.id));
  await query('delete from lp_client_pages where landing_page_id = $1', [lp.id]);
  await deleteOrphanClients();
  res.json({ client: null });
});
