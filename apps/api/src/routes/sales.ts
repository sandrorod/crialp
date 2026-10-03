import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole, type AuthUser } from '../middleware/auth.js';
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
  // Vendedor só vê os clientes atribuídos a ele
  const result = await listCompanies(user.organizationId, { ...q, sellerId: user.role === 'seller' ? user.id : undefined });
  const { rows } = await query<{ company_id: string; count: number; last_at: string }>(
    `select company_id, count(*)::int as count, max(created_at) as last_at
       from prospecting_notes where organization_id = $1 group by company_id`,
    [user.organizationId],
  );
  const stats = new Map(rows.map((r) => [r.company_id, r]));
  // Empresas sem prospecção primeiro; dentro de cada grupo, ordem alfabética
  const items = [...result.items].sort(
    (a, b) => Number(stats.has(a.id)) - Number(stats.has(b.id)) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
  // Filtros do vendedor: só segmentos e cidades dos clientes dele
  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const mine = user.role === 'seller' ? (await listCompanies(user.organizationId, { sellerId: user.id })).items : null;
  const facets = mine ? { segments: uniq(mine.map((c) => c.segment)), cities: uniq(mine.map((c) => c.city)) } : result.facets;
  res.json({
    facets,
    items: items.map((c) => ({
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
      landing_page_id: c.landing_page_id ?? null,
      seller_id: c.seller_id ?? null,
      seller_name: c.seller_name ?? null,
      notes_count: stats.get(c.id)?.count ?? 0,
      last_note_at: stats.get(c.id)?.last_at ?? null,
    })),
  });
});

/** Empresa da organização; para vendedor, só se a Landing Page dela estiver atribuída a ele. */
async function ensureCompany(user: AuthUser, id: string) {
  const company = await one<{ id: string; name: string }>(
    `select c.id, c.name from companies c
      where c.id = $1 and c.organization_id = $2
        and ($3::uuid is null or exists (select 1 from landing_pages lp where lp.company_id = c.id and lp.seller_id = $3))`,
    [id, user.organizationId, user.role === 'seller' ? user.id : null],
  );
  if (!company) throw notFound('Empresa não encontrada.');
  return company;
}

salesRouter.get('/companies/:id/notes', async (req, res) => {
  const user = authUser(req);
  const company = await ensureCompany(user, uuidParam.parse(req.params.id));
  const { rows } = await query(
    `select id, author_name, note, created_at from prospecting_notes
      where company_id = $1 order by created_at desc, id desc`,
    [company.id],
  );
  res.json(rows);
});

const NoteSchema = z.object({ note: z.string().trim().min(1, 'Escreva as informações da prospecção.').max(5000, 'Máximo de 5.000 caracteres.') });

// Lançamentos não podem ser editados; só administradores podem excluí-los
salesRouter.post('/companies/:id/notes', async (req, res) => {
  const user = authUser(req);
  const company = await ensureCompany(user, uuidParam.parse(req.params.id));
  const { note } = parseBody(NoteSchema, req.body);
  const created = await one(
    `insert into prospecting_notes (organization_id, company_id, user_id, author_name, note)
     values ($1, $2, $3, $4, $5) returning id, author_name, note, created_at`,
    [user.organizationId, company.id, user.id, user.name, note],
  );
  res.status(201).json(created);
});

salesRouter.delete('/companies/:id/notes/:noteId', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const company = await ensureCompany(user, uuidParam.parse(req.params.id));
  const { rowCount } = await query('delete from prospecting_notes where id = $1 and company_id = $2', [uuidParam.parse(req.params.noteId), company.id]);
  if (!rowCount) throw notFound('Lançamento não encontrado.');
  res.json({ ok: true });
});
