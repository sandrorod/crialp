import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { listCompanies } from '../repositories/companies.js';

/** Área de Vendas: lista de empresas (somente leitura) e histórico de prospecção. */
export const salesRouter = Router();

salesRouter.get('/companies', async (req, res) => {
  const user = authUser(req);
  const q = z
    .object({
      search: z.string().max(200).optional(),
      segment: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
    })
    .parse(req.query);
  const result = await listCompanies(user.organizationId, q);
  const { rows } = await query<{ company_id: string; count: number; last_at: string }>(
    `select company_id, count(*)::int as count, max(created_at) as last_at
       from prospecting_notes where organization_id = $1 group by company_id`,
    [user.organizationId],
  );
  const stats = new Map(rows.map((r) => [r.company_id, r]));
  res.json({
    facets: result.facets,
    items: result.items.map((c) => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      state: c.state,
      phone: c.phone,
      whatsapp: c.whatsapp,
      email: c.email,
      created_at: c.created_at,
      slug: c.status === 'ativa' ? c.slug : null, // só páginas publicadas
      notes_count: stats.get(c.id)?.count ?? 0,
      last_note_at: stats.get(c.id)?.last_at ?? null,
    })),
  });
});

async function ensureCompany(orgId: string, id: string) {
  const company = await one<{ id: string; name: string }>('select id, name from companies where id = $1 and organization_id = $2', [id, orgId]);
  if (!company) throw notFound('Empresa não encontrada.');
  return company;
}

salesRouter.get('/companies/:id/notes', async (req, res) => {
  const user = authUser(req);
  const company = await ensureCompany(user.organizationId, uuidParam.parse(req.params.id));
  const { rows } = await query(
    `select id, author_name, note, created_at from prospecting_notes
      where company_id = $1 order by created_at desc, id desc`,
    [company.id],
  );
  res.json(rows);
});

const NoteSchema = z.object({ note: z.string().trim().min(1, 'Escreva as informações da prospecção.').max(5000, 'Máximo de 5.000 caracteres.') });

// Lançamentos são somente inclusão: não existem rotas de edição nem de exclusão
salesRouter.post('/companies/:id/notes', async (req, res) => {
  const user = authUser(req);
  const company = await ensureCompany(user.organizationId, uuidParam.parse(req.params.id));
  const { note } = parseBody(NoteSchema, req.body);
  const created = await one(
    `insert into prospecting_notes (organization_id, company_id, user_id, author_name, note)
     values ($1, $2, $3, $4, $5) returning id, author_name, note, created_at`,
    [user.organizationId, company.id, user.id, user.name, note],
  );
  res.status(201).json(created);
});
