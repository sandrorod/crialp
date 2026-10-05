import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, Messages, notFound } from '../lib/errors.js';
import { normalizeInputUrl } from '../lib/url.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { aiService } from '../services/ai/index.js';
import { jobService } from '../services/jobs/JobService.js';
import { analyzeUrl } from '../services/pipeline/analyzeUrl.js';
import { generateLanding } from '../services/pipeline/generateLanding.js';
import { findDuplicateCompany, getCompanyFull, matchRegisteredCompanies } from '../repositories/companies.js';
import { searchCompanies, searchCompanySites, type FoundCompany } from '../services/search/companySearch.js';
import { appendSearch, createSearch, deleteSearch, getSearch, listSearches } from '../repositories/companySearches.js';

export const analyzeRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de processamentos por hora atingido. Tente mais tarde.' },
});

/**
 * POST /api/analyze-url { url }
 * Inicia a coleta + interpretação. Responde imediatamente com o jobId; a interface
 * acompanha o progresso em GET /api/jobs/:id e recebe os dados estruturados no resultado.
 */
analyzeRouter.post('/analyze-url', aiLimiter, async (req, res) => {
  const user = authUser(req);
  const { url, allowImages, place } = parseBody(
    z.object({
      url: z.string({ error: Messages.invalidUrl }),
      allowImages: z.boolean().optional(),
      // Local do Google Maps escolhido em "Buscar empresas" (dados já obtidos na pesquisa)
      place: z
        .object({
          name: z.string().trim().min(1).max(300),
          phone: z.string().max(40).nullish(),
          address: z.string().max(500).nullish(),
          website: z.string().max(2048).nullish(),
          rating: z.number().min(0).max(5).nullish(),
          reviews: z.number().int().min(0).nullish(),
          photos: z.array(z.string().url().max(2048)).max(40).nullish(),
          place_id: z.string().max(200).nullish(),
          google_url: z.string().max(2048).nullish(),
        })
        .optional(),
    }),
    req.body,
  );
  const parsed = normalizeInputUrl(url);
  // Evita cadastrar de novo (e gastar uma análise) uma empresa que já existe
  const dup = await findDuplicateCompany(user.organizationId, { url: parsed.toString() });
  if (dup) throw new AppError(409, `Esta empresa já foi cadastrada: "${dup.name}" (mesmo link).`, 'DUPLICATE_COMPANY');
  if (!(await aiService.isConfigured())) throw new AppError(503, Messages.aiNotConfigured);
  const jobId = await jobService.create(user.organizationId, 'analyze_url', { url: parsed.toString() });
  jobService.run(jobId, (job) => analyzeUrl(job, parsed, { allowImages, place }));
  res.status(202).json({ jobId });
});

/**
 * POST /api/generate-landing-page { companyId, landingPageId?, keepTheme? }
 * Gera (ou regenera, criando nova versão) a Landing Page a partir dos dados estruturados.
 */
analyzeRouter.post('/generate-landing-page', aiLimiter, async (req, res) => {
  const user = authUser(req);
  const body = parseBody(
    z.object({ companyId: uuidParam, landingPageId: uuidParam.optional(), keepTheme: z.boolean().optional() }),
    req.body,
  );
  if (!(await aiService.isConfigured())) throw new AppError(503, Messages.aiNotConfigured);
  if (!(await getCompanyFull(user.organizationId, body.companyId))) throw notFound('Empresa não encontrada.');
  const jobId = await jobService.create(user.organizationId, 'generate_landing_page', body);
  jobService.run(jobId, (job) =>
    generateLanding(job, { orgId: user.organizationId, userId: user.id, ...body }),
  );
  res.status(202).json({ jobId });
});

analyzeRouter.get('/jobs/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const job = await jobService.get(user.organizationId, id);
  if (!job) throw notFound();
  const { raw: _raw, ...result } = (job.result ?? {}) as Record<string, unknown>;
  res.json({ id: job.id, type: job.type, status: job.status, step: job.step, error: job.error, result: job.result ? result : null });
});

/** Botão "Interromper": para a análise ou a geração em andamento. */
analyzeRouter.post('/jobs/:id/cancel', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  if (!(await jobService.get(user.organizationId, id))) throw notFound();
  await jobService.cancel(user.organizationId, id);
  res.json({ ok: true });
});

const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de pesquisas por hora atingido. Tente mais tarde.' },
});

/** GET /api/company-search?q=…&type=sites|locais — empresas encontradas no Google, marcando as já cadastradas. */
analyzeRouter.get('/company-search', searchLimiter, async (req, res) => {
  const user = authUser(req);
  const { q, type, filter, lat, lng, page, search_id } = z
    .object({
      q: z.string().trim().min(2, 'Digite o que deseja pesquisar.').max(200),
      type: z.enum(['sites', 'locais']).default('sites'),
      // Todas as empresas, só com site próprio ou só sem site
      filter: z.enum(['todos', 'com_site', 'sem_site']).default('todos'),
      // Localização do navegador (opcional): locais perto de quem pesquisa, como no Google
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      // "Buscar mais locais": anéis cada vez mais largos ao redor do mesmo centro
      page: z.coerce.number().int().min(0).max(10).default(0),
      // Pesquisa salva que recebe os locais de "Buscar mais locais"
      search_id: z.string().uuid().optional(),
    })
    .parse(req.query);
  const latLng = lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined;
  // "Buscar mais locais" de pesquisa com cidade continua ao redor do mesmo centro
  const saved = search_id && page > 0 ? await getSearch(user.organizationId, search_id) : null;
  const places = type === 'locais' ? await searchCompanies(q, filter, page, saved?.center ?? latLng ?? null) : null;
  const items = places ? places.items : await searchCompanySites(q);
  const source = type === 'locais' ? 'maps' : 'web';
  const registered = await matchRegisteredCompanies(user.organizationId, items);
  const marked = items.map((c, i) => ({ ...c, existing: registered[i] }));
  // Grava toda pesquisa no histórico, mesmo sem resultados (a marcação de cadastrada/LP é recalculada ao abrir)
  let savedId: string | null = null;
  let historyError: string | null = null;
  try {
    const data = { center: places?.center ?? null, page, hasMore: places?.hasMore ?? false, results: items };
    if (search_id && page > 0) savedId = (await appendSearch(user.organizationId, search_id, data)) != null ? search_id : null;
    if (!savedId) savedId = await createSearch(user.organizationId, user.id, { query: q, ...data });
  } catch (err) {
    // Falha no histórico não pode esconder os resultados, mas precisa aparecer
    console.error('[company-search] falha ao gravar histórico', err);
    historyError = 'A pesquisa não foi gravada no histórico (erro no banco de dados). Os resultados abaixo continuam válidos.';
  }
  const warning = [places?.warning, historyError].filter(Boolean).join(' ') || null;
  res.json({ items: marked, source, center: places?.center ?? null, has_more: places?.hasMore ?? false, warning, search_id: savedId });
});

/** Histórico de pesquisas de "Buscar empresas". */
analyzeRouter.get('/company-searches', async (req, res) => {
  const user = authUser(req);
  // Lista muda a cada pesquisa: nunca reaproveitar resposta em cache
  res.set('Cache-Control', 'no-store');
  res.json({ items: await listSearches(user.organizationId) });
});

/** Resultados salvos de uma pesquisa, com a marcação atual de empresa cadastrada / LP gerada. */
analyzeRouter.get('/company-searches/:id', async (req, res) => {
  const user = authUser(req);
  const search = await getSearch(user.organizationId, uuidParam.parse(req.params.id));
  if (!search) throw notFound('Pesquisa não encontrada.');
  const items = search.results as FoundCompany[];
  const registered = await matchRegisteredCompanies(user.organizationId, items);
  res.json({ ...search, results: items.map((c, i) => ({ ...c, existing: registered[i] })) });
});

analyzeRouter.delete('/company-searches/:id', async (req, res) => {
  const user = authUser(req);
  if (!(await deleteSearch(user.organizationId, uuidParam.parse(req.params.id)))) throw notFound('Pesquisa não encontrada.');
  res.json({ ok: true });
});
