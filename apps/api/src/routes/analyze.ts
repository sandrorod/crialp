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
  const { url, allowImages } = parseBody(
    z.object({ url: z.string({ error: Messages.invalidUrl }), allowImages: z.boolean().optional() }),
    req.body,
  );
  const parsed = normalizeInputUrl(url);
  // Evita cadastrar de novo (e gastar uma análise) uma empresa que já existe
  const dup = await findDuplicateCompany(user.organizationId, { url: parsed.toString() });
  if (dup) throw new AppError(409, `Esta empresa já foi cadastrada: "${dup.name}" (mesmo link).`, 'DUPLICATE_COMPANY');
  if (!aiService.isConfigured()) throw new AppError(503, Messages.aiNotConfigured);
  const jobId = await jobService.create(user.organizationId, 'analyze_url', { url: parsed.toString() });
  jobService.run(jobId, (job) => analyzeUrl(job, parsed, { allowImages }));
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
  if (!aiService.isConfigured()) throw new AppError(503, Messages.aiNotConfigured);
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
