import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { batchService, GAP_MAX, validTickToken, type BatchRow } from '../services/jobs/BatchService.js';

/** O que a tela do lote mostra (sem os dados internos de controle). */
const view = (b: BatchRow) => ({
  id: b.id,
  status: b.status,
  stage: b.stage,
  index: b.idx,
  ok: b.ok,
  fotos: b.fotos,
  gap: b.gap_minutes,
  items: b.items.map((i) => ({ url: i.url, name: i.name })),
  results: b.results,
  job_id: b.job_id,
  next_at: b.status === 'running' && b.stage === 'wait' ? b.next_at : null,
  paused_left: b.paused_left,
  now: new Date().toISOString(),
});

/** Continuação interna do lote: o servidor chama a si mesmo (fora da autenticação, com token do lote). */
export const lpBatchTickRouter = Router();

lpBatchTickRouter.post('/lp-batches/:id/tick', async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  if (!validTickToken(id, req.get('x-batch-token'))) return res.status(403).json({ error: 'Token inválido.' });
  await batchService.tick(id);
  res.json({ ok: true });
});

export const lpBatchesRouter = Router();

const PlaceSchema = z.object({
  name: z.string().trim().min(1).max(300),
  phone: z.string().max(40).nullish(),
  address: z.string().max(500).nullish(),
  website: z.string().max(2048).nullish(),
  rating: z.number().min(0).max(5).nullish(),
  reviews: z.number().int().min(0).nullish(),
  photos: z.array(z.string().url().max(2048)).max(40).nullish(),
  place_id: z.string().max(200).nullish(),
  google_url: z.string().max(2048).nullish(),
});

/** POST /api/lp-batches { items, fotos, gap }: começa a gerar as LPs das empresas, uma de cada vez, no servidor. */
lpBatchesRouter.post('/lp-batches', async (req, res) => {
  const user = authUser(req);
  const body = parseBody(
    z.object({
      items: z
        .array(z.object({ url: z.string().trim().min(1).max(2048), name: z.string().trim().max(300), place: PlaceSchema.nullish() }))
        .min(1, 'Selecione ao menos uma empresa.')
        .max(200, 'No máximo 200 empresas por lote.'),
      fotos: z.boolean().default(false),
      gap: z.number().int().min(0).max(GAP_MAX).default(3),
    }),
    req.body,
  );
  if (await batchService.active(user.organizationId)) throw new AppError(409, 'Já existe um lote em andamento. Pare ou espere ele terminar.', 'BATCH_RUNNING');
  const id = await batchService.create(user.organizationId, user.id, body.items, body.fotos, body.gap);
  res.status(201).json({ id });
});

/** Lote em andamento (ou pausado), para retomar o acompanhamento. */
lpBatchesRouter.get('/lp-batches/active', async (req, res) => {
  const user = authUser(req);
  const b = await batchService.active(user.organizationId);
  res.json({ batch: b ? view(b) : null });
});

lpBatchesRouter.get('/lp-batches/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  if (!(await batchService.get(user.organizationId, id))) throw notFound('Lote não encontrado.');
  // A consulta da tela também empurra o lote (caso a continuação do servidor tenha se perdido)
  await batchService.advance(id).catch((err) => console.error(`[lote ${id}]`, err));
  res.json(view((await batchService.get(user.organizationId, id))!));
});

lpBatchesRouter.post('/lp-batches/:id/action', async (req, res) => {
  const user = authUser(req);
  const { action, gap } = parseBody(
    z.object({ action: z.enum(['pause', 'resume', 'now', 'skip', 'cancel', 'gap']), gap: z.number().int().min(0).max(GAP_MAX).optional() }),
    req.body,
  );
  const b = await batchService.action(user.organizationId, uuidParam.parse(req.params.id), action, gap);
  if (!b) throw notFound('Lote não encontrado.');
  res.json(view(b));
});
