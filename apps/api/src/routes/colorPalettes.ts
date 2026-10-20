import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { DESIGN_PRESETS } from '../services/ai/schemas.js';
import { normalizeSectionColors } from '../landing/sectionColors.js';

/** Combinações de cores salvas no editor da LP (estilo + cores principais + cores das seções), com nome. */
export const colorPalettesRouter = Router();

const COLUMNS = 'id, name, preset, primary_color as primary, accent_color as accent, sections, created_at, updated_at';
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.').transform((v) => v.toLowerCase()).nullish().transform((v) => v ?? null);

const PaletteSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da combinação.').max(60),
  preset: z.enum(DESIGN_PRESETS as unknown as [string, ...string[]]),
  primary: hex,
  accent: hex,
  // Seções criadas na própria página (custom:<id>) não existem nas outras: ficam de fora
  sections: z.record(z.string(), z.unknown()).nullish().transform((v) =>
    Object.fromEntries(Object.entries(normalizeSectionColors(v ?? {})).filter(([k]) => !k.startsWith('custom:'))),
  ),
});

colorPalettesRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(`select ${COLUMNS} from lp_color_palettes where organization_id = $1 order by lower(name)`, [user.organizationId]);
  res.json(rows);
});

/** Salva a combinação; com o nome de uma já salva, substitui as cores dela. */
colorPalettesRouter.post('/', async (req, res) => {
  const user = authUser(req);
  const body = parseBody(PaletteSchema, req.body);
  const saved = await one(
    `insert into lp_color_palettes (organization_id, name, preset, primary_color, accent_color, sections, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (organization_id, lower(name)) do update
       set name = excluded.name, preset = excluded.preset, primary_color = excluded.primary_color,
           accent_color = excluded.accent_color, sections = excluded.sections, updated_at = now()
     returning ${COLUMNS}`,
    [user.organizationId, body.name, body.preset, body.primary, body.accent, JSON.stringify(body.sections), user.id],
  );
  res.status(201).json(saved);
});

colorPalettesRouter.delete('/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const removed = await one('delete from lp_color_palettes where id = $1 and organization_id = $2 returning id', [id, user.organizationId]);
  if (!removed) throw notFound('Combinação não encontrada.');
  res.json({ ok: true });
});
