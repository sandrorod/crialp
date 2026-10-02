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
import { findDuplicateCompany, getCompanyFull } from '../repositories/companies.js';
import { searchCompanyPlaces, searchCompanySites } from '../services/search/companySearch.js';

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
  const { q, type, lat, lng } = z
    .object({
      q: z.string().trim().min(2, 'Digite o que deseja pesquisar.').max(200),
      type: z.enum(['sites', 'locais']).default('sites'),
      // Localização do navegador (opcional): locais perto de quem pesquisa, como no Google
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
    })
    .parse(req.query);
  const latLng = lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined;
  const items = type === 'locais' ? await searchCompanyPlaces(q, latLng) : await searchCompanySites(q);
  const source = type === 'locais' ? 'maps' : 'web';
  const marked = await Promise.all(
    items.map(async (c) => ({ ...c, existing: await findDuplicateCompany(user.organizationId, { url: c.url, website: c.website, name: c.name }) })),
  );
  res.json({ items: marked, source });
});
