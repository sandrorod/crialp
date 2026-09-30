import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { AppError, notFound } from '../lib/errors.js';
import { normalizeInputUrl } from '../lib/url.js';
import { CompanyInputSchema, parseBody, safeUrl, uuidParam, type CompanyInput } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { appendCompanyImages, createCompany, deleteCompany, findDuplicateCompany, getCompanyFull, listCompanies, removeCompanyImages, updateCompany } from '../repositories/companies.js';
import { saveVersion, type LandingPageRow } from '../repositories/landingPages.js';
import { refreshSnapshot } from '../landing/publish.js';
import { aiService } from '../services/ai/index.js';
import { assembleImages } from '../services/pipeline/images.js';
import { describeImages, ScraperService } from '../services/scraper/ScraperService.js';
import type { CompanyFull } from '../repositories/companies.js';
import type { SectionKey, SectionOrderKey } from '../services/ai/schemas.js';
import { getSources, saveSources, toSourcePayload, type SourcePayload } from '../repositories/sources.js';
import { jobService } from '../services/jobs/JobService.js';

/**
 * Quando a empresa passa a ter fotos liberadas e a LP foi gerada sem galeria,
 * inclui a seção de galeria automaticamente (como nova versão).
 */
async function ensureGallery(lp: LandingPageRow, company: CompanyFull, orgId: string, userId: string) {
  const photos = company.images.filter((i) => i.usage_allowed && i.type !== 'logo').length;
  if (photos < 3 || lp.content.gallery) return lp;
  const order: SectionOrderKey[] = lp.content.section_order.filter((k) => k !== 'gallery');
  const before = ['testimonials', 'faq', 'contact', 'final_cta'].map((k) => order.indexOf(k as SectionKey)).filter((i) => i >= 0);
  order.splice(before.length ? Math.min(...before) : order.length, 0, 'gallery');
  const content = { ...lp.content, gallery: { title: 'Conheça nosso espaço', subtitle: null }, section_order: order };
  await saveVersion({
    id: lp.id,
    orgId,
    userId,
    content,
    theme: lp.theme,
    seo: { seo_title: lp.seo_title, seo_description: lp.seo_description, seo_keywords: lp.seo_keywords, og_image: lp.og_image },
    note: 'Galeria adicionada (novas fotos liberadas)',
  });
  return { ...lp, content };
}

export const companiesRouter = Router();

/** O logotipo oficial é a imagem do tipo "logo" com permissão de uso confirmada. */
function withLogo(input: CompanyInput): CompanyInput {
  const logo = input.images.find((i) => i.type === 'logo' && i.usage_allowed);
  return { ...input, logo_url: logo?.url ?? null };
}

companiesRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const q = z
    .object({
      search: z.string().max(200).optional(),
      segment: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      status: z.enum(['ativa', 'inativa', 'sem_lp']).optional(),
    })
    .parse(req.query);
  res.json(await listCompanies(user.organizationId, q));
});

companiesRouter.get('/:id', async (req, res) => {
  const user = authUser(req);
  const company = await getCompanyFull(user.organizationId, uuidParam.parse(req.params.id));
  if (!company) throw notFound('Empresa não encontrada.');
  res.json(company);
});

companiesRouter.post('/', async (req, res) => {
  const user = authUser(req);
  const body = parseBody(
    CompanyInputSchema.extend({ source_meta: z.record(z.string(), z.any()).optional(), analysis_job_id: uuidParam.optional() }),
    req.body,
  );
  const { source_meta, analysis_job_id, ...input } = body;
  const dup = await findDuplicateCompany(user.organizationId, { url: input.reference_url, website: input.website, name: input.name, tradeName: input.trade_name });
  if (dup) throw new AppError(409, `Esta empresa já foi cadastrada: "${dup.name}" (mesmo ${dup.reason}).`, 'DUPLICATE_COMPANY');
  const id = await createCompany(user.organizationId, user.id, withLogo(input), source_meta ?? {});
  // Conteúdo completo do site, guardado pela análise
  if (analysis_job_id) {
    const job = await jobService.get(user.organizationId, analysis_job_id);
    const raw = (job?.result as { raw?: SourcePayload } | null)?.raw;
    if (job?.type === 'analyze_url' && raw) await saveSources(id, raw);
  }
  res.status(201).json({ id });
});

companiesRouter.put('/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const input = parseBody(CompanyInputSchema, req.body);
  if (!(await updateCompany(user.organizationId, id, withLogo(input)))) throw notFound('Empresa não encontrada.');
  // As LPs são renderizadas a partir dos dados da empresa: atualiza os snapshots
  const company = (await getCompanyFull(user.organizationId, id))!;
  const { rows } = await query<LandingPageRow>('select * from landing_pages where company_id = $1', [id]);
  for (const lp of rows) await refreshSnapshot(await ensureGallery(lp, company, user.organizationId, user.id));
  res.json(company);
});

/** Fotos adicionadas pelo editor da LP (envio ou URL): entram já liberadas para uso. */
companiesRouter.post('/:id/images', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const { images } = parseBody(
    z.object({
      images: z
        .array(
          z.object({
            url: safeUrl.refine((v) => !!v, 'URL da imagem inválida.').transform((v) => v as string),
            alt_text: z.string().trim().max(300).nullish().transform((v) => v || null),
            source: z.enum(['upload', 'manual']).default('manual'),
          }),
        )
        .min(1)
        .max(30),
    }),
    req.body,
  );
  if (!(await appendCompanyImages(user.organizationId, id, images))) throw notFound('Empresa não encontrada.');
  const company = (await getCompanyFull(user.organizationId, id))!;
  const { rows } = await query<LandingPageRow>('select * from landing_pages where company_id = $1', [id]);
  for (const lp of rows) await refreshSnapshot(lp);
  res.json(company);
});

/** Fotos apagadas pelo editor da LP: saem do cadastro e de todas as páginas da empresa. */
companiesRouter.post('/:id/images/remove', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const { urls } = parseBody(z.object({ urls: z.array(z.string().max(2048)).min(1).max(200) }), req.body);
  if (!(await removeCompanyImages(user.organizationId, id, urls))) throw notFound('Empresa não encontrada.');
  const company = (await getCompanyFull(user.organizationId, id))!;
  const { rows } = await query<LandingPageRow>('select * from landing_pages where company_id = $1', [id]);
  for (const lp of rows) await refreshSnapshot(lp);
  res.json(company);
});

/**
 * Busca (de novo) as fotos no site da empresa. Não salva: devolve as imagens novas
 * para o administrador revisar no formulário antes de salvar.
 */
companiesRouter.post('/:id/fetch-images', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const { allowImages } = parseBody(z.object({ allowImages: z.boolean().optional() }), req.body);
  const company = await getCompanyFull(user.organizationId, id);
  if (!company) throw notFound('Empresa não encontrada.');
  const source = company.reference_url || company.website;
  if (!source) throw new AppError(400, 'Cadastre a URL de referência ou o site da empresa para buscar fotos.');

  const scrape = await new ScraperService().scrape(normalizeInputUrl(source));
  if (!scrape.images.length) throw new AppError(422, 'Nenhuma foto utilizável foi encontrada neste site.');

  let classification = null;
  if (await aiService.isConfigured()) {
    try {
      classification = await aiService.classifyImages(company.trade_name || company.name, company.segment, describeImages(scrape.images));
    } catch (err) {
      console.warn('[fotos] classificação pela IA falhou; usando as maiores imagens.', err instanceof Error ? err.message : err);
    }
  }
  const images = assembleImages({
    scraped: scrape.images,
    classified: classification?.images ?? null,
    logoIndex: classification?.logo_index ?? null,
    allowUsage: !!allowImages,
    companyName: company.trade_name || company.name,
  });
  const existing = new Set(company.images.map((i) => i.url));
  res.json({ images: images.filter((i) => !existing.has(i.url)), found: scrape.images.length, classified: !!classification });
});

/** Conteúdo completo coletado do site (texto de cada página + dados encontrados). */
companiesRouter.get('/:id/sources', async (req, res) => {
  const user = authUser(req);
  const company = await getCompanyFull(user.organizationId, uuidParam.parse(req.params.id));
  if (!company) throw notFound('Empresa não encontrada.');
  res.json(await getSources(company.id));
});

/** Lê o site novamente e substitui o conteúdo bruto guardado (não altera o cadastro). */
companiesRouter.post('/:id/sources/refresh', async (req, res) => {
  const user = authUser(req);
  const company = await getCompanyFull(user.organizationId, uuidParam.parse(req.params.id));
  if (!company) throw notFound('Empresa não encontrada.');
  const source = company.reference_url || company.website;
  if (!source) throw new AppError(400, 'Cadastre a URL de referência ou o site da empresa.');
  const scrape = await new ScraperService().scrape(normalizeInputUrl(source));
  await saveSources(company.id, toSourcePayload(scrape));
  res.json(await getSources(company.id));
});

companiesRouter.delete('/:id', async (req, res) => {
  const user = authUser(req);
  if (!(await deleteCompany(user.organizationId, uuidParam.parse(req.params.id)))) throw notFound('Empresa não encontrada.');
  res.json({ ok: true });
});
