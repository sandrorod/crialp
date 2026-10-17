import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole } from '../middleware/auth.js';

/** Níveis de cliente: a equipe lista (select na geração da LP); administradores criam, editam e excluem. */
export const clientLevelsRouter = Router();

const COLUMNS = `id, name, description, created_at, updated_at,
  (select count(*)::int from landing_pages lp where lp.client_level_id = lp_client_levels.id) as landing_pages`;

const LevelSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do nível.').max(80),
  description: z.string().trim().max(300).nullish().transform((v) => v || null),
});

clientLevelsRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(`select ${COLUMNS} from lp_client_levels where organization_id = $1 order by lower(name)`, [user.organizationId]);
  res.json(rows);
});

clientLevelsRouter.post('/', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const body = parseBody(LevelSchema, req.body);
  await ensureNameFree(user.organizationId, body.name);
  const created = await one(
    `insert into lp_client_levels (organization_id, name, description) values ($1, $2, $3) returning ${COLUMNS}`,
    [user.organizationId, body.name, body.description],
  );
  res.status(201).json(created);
});

clientLevelsRouter.patch('/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const body = parseBody(LevelSchema, req.body);
  await ensureNameFree(user.organizationId, body.name, id);
  const updated = await one(
    `update lp_client_levels set name = $3, description = $4, updated_at = now()
      where id = $1 and organization_id = $2 returning ${COLUMNS}`,
    [id, user.organizationId, body.name, body.description],
  );
  if (!updated) throw notFound('Nível não encontrado.');
  res.json(updated);
});

clientLevelsRouter.delete('/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  // As páginas desse nível ficam sem nível (on delete set null)
  const removed = await one('delete from lp_client_levels where id = $1 and organization_id = $2 returning id', [id, user.organizationId]);
  if (!removed) throw notFound('Nível não encontrado.');
  res.json({ ok: true });
});

async function ensureNameFree(orgId: string, name: string, exceptId?: string) {
  const taken = await one(
    'select 1 from lp_client_levels where organization_id = $1 and lower(name) = lower($2) and ($3::uuid is null or id <> $3)',
    [orgId, name, exceptId ?? null],
  );
  if (taken) throw new AppError(409, 'Já existe um nível com esse nome.');
}
