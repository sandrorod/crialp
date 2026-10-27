import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { longText, parseBody, text, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole, type AuthUser } from '../middleware/auth.js';
import { inProspecting, prospectingState } from '../repositories/companies.js';
import { env } from '../config/env.js';
import { aiKeyStore } from '../services/ai/keyStore.js';
import { gifToSticker } from '../services/crm/gifSticker.js';
import { assertPublicHost } from '../lib/url.js';
import {
  evolution,
  importHistory,
  loadMedia,
  markRevoked,
  markEdited,
  EDIT_WINDOW_MS,
  CRM_WEBHOOK_EVENTS,
  MEDIA_TYPES,
  refreshConversationSummary,
  jidNumber,
  loadConfig,
  markReadOnWhatsapp,
  normalizeNumber,
  registerMessage,
  relinkConversations,
  saveConfig,
  syncRecent,
  webhookUrl,
  canSetWebhook,
} from '../services/crm/whatsapp.js';

/**
 * CRM: empresas (as já cadastradas), contatos, funil, tarefas e WhatsApp.
 * Gerência (owner/admin) vê tudo; vendedor só as empresas cuja Landing Page está atribuída a ele.
 */
export const crmRouter = Router();

const isManager = (u: AuthUser) => MANAGER_ROLES.includes(u.role);
/** Id do vendedor para filtrar, ou null para a gerência (sem filtro). */
const sellerScope = (u: AuthUser) => (isManager(u) ? null : u.id);
/**
 * Empresa `alias` visível ao vendedor do parâmetro `p` (null = gerência, todas): só as empresas atribuídas
 * a ele (Landing Page com ele de vendedor) e com o campo Prospecção = Sim.
 */
const visible = (alias: string, p: string) =>
  `(${p}::uuid is null or exists (select 1 from companies cpv where cpv.id = ${alias} and ${inProspecting('cpv')}
     and exists (select 1 from landing_pages lpv where lpv.company_id = cpv.id and lpv.seller_id = ${p}::uuid)))`;
/** Filtro da gerência por vendedor (Funil): empresas cuja Landing Page está atribuída a ele (null = sem filtro). */
const assignedTo = (alias: string, p: string) =>
  `(${p}::uuid is null or exists (select 1 from landing_pages lpa where lpa.company_id = ${alias} and lpa.seller_id = ${p}))`;

/** Conversa `alias` visível ao vendedor `p`: da carteira dele, ou sem empresa e iniciada por ele (número fora do cadastro). */
const convVisible = (alias: string, p: string) =>
  `(${p}::uuid is null or (${alias}.company_id is not null and ${visible(`${alias}.company_id`, p)}) or (${alias}.company_id is null and ${alias}.started_by = ${p}))`;

/** Pode iniciar conversa com número fora do cadastro: o dono sempre; os demais conforme a configuração (padrão: só admin). */
async function canChatFreeNumber(user: AuthUser) {
  if (user.role === 'owner') return true;
  const row = await one<{ allowed: boolean }>('select allowed from lp_crm_free_number_users where user_id = $1 and organization_id = $2', [
    user.id,
    user.organizationId,
  ]);
  return row ? row.allowed : user.role === 'admin';
}

async function ensureCompany(user: AuthUser, id: string) {
  const company = await one<{ id: string; name: string; whatsapp: string | null; mobile: string | null }>(
    `select c.id, coalesce(c.trade_name, c.name) as name, c.whatsapp, c.mobile from companies c
      where c.id = $1 and c.organization_id = $2 and ${visible('c.id', '$3')}`,
    [id, user.organizationId, sellerScope(user)],
  );
  if (!company) throw notFound('Empresa não encontrada.');
  return company;
}

async function ensureContact(user: AuthUser, id: string) {
  const contact = await one<{ id: string; company_id: string; whatsapp: string | null }>(
    'select id, company_id, whatsapp from lp_crm_contacts where id = $1 and organization_id = $2',
    [id, user.organizationId],
  );
  if (!contact) throw notFound('Contato não encontrado.');
  await ensureCompany(user, contact.company_id);
  return contact;
}

async function ensureConversation(user: AuthUser, id: string) {
  const conv = await one<{ id: string; phone: string; remote_jid: string | null; company_id: string | null }>(
    `select cv.id, cv.phone, cv.remote_jid, cv.company_id from lp_crm_conversations cv
      where cv.id = $1 and cv.organization_id = $2
        and ${convVisible('cv', '$3')}`,
    [id, user.organizationId, sellerScope(user)],
  );
  if (!conv) throw notFound('Conversa não encontrada.');
  return conv;
}

/** Erro de WhatsApp duplicado em contato vira mensagem legível. */
function friendlyDbError(err: unknown): never {
  if ((err as { constraint?: string }).constraint === 'lp_crm_contacts_wa_uniq') {
    throw new AppError(409, 'Este WhatsApp já está cadastrado em outro contato.', 'CRM_DUP_WHATSAPP');
  }
  throw err;
}

// ─── Usuários (filtros e responsáveis) ──────────────────────────────

crmRouter.get('/users', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(
    `select id, name, role from users where organization_id = $1 and role in ('owner', 'admin', 'seller')
        and ($2::uuid is null or id = $2) order by name`,
    [user.organizationId, sellerScope(user)],
  );
  res.json(rows);
});

// O que a pessoa pode fazer no CRM além do padrão do papel
crmRouter.get('/permissions', async (req, res) => {
  res.json({ free_number: await canChatFreeNumber(authUser(req)) });
});

// Quem pode iniciar conversa com número fora do cadastro (configurado pela gerência na aba Conexão)
crmRouter.get('/free-number-users', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(
    `select u.id, u.name, u.role, (u.role = 'owner' or coalesce(p.allowed, u.role = 'admin')) as allowed
       from users u left join lp_crm_free_number_users p on p.user_id = u.id
      where u.organization_id = $1 and u.role in ('owner', 'admin', 'seller')
      order by case u.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.name`,
    [user.organizationId],
  );
  res.json(rows);
});

crmRouter.put('/free-number-users/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const { allowed } = parseBody(z.object({ allowed: z.boolean() }), req.body);
  const target = await one<{ id: string; role: string }>(
    "select id, role from users where id = $1 and organization_id = $2 and role in ('owner', 'admin', 'seller')",
    [uuidParam.parse(req.params.id), user.organizationId],
  );
  if (!target) throw notFound('Usuário não encontrado.');
  if (target.role === 'owner') throw badRequest('O dono sempre pode iniciar conversa com número fora do cadastro.');
  await query(
    `insert into lp_crm_free_number_users (user_id, organization_id, allowed, updated_by) values ($1, $2, $3, $4)
     on conflict (user_id) do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now()`,
    [target.id, user.organizationId, allowed, user.id],
  );
  res.json({ ok: true });
});

// ─── Empresas ───────────────────────────────────────────────────────

crmRouter.get('/companies', async (req, res) => {
  const user = authUser(req);
  const f = z.object({ search: z.string().max(200).optional(), seller: z.string().max(40).optional() }).parse(req.query);
  const params: unknown[] = [user.organizationId, sellerScope(user)];
  const where = ['c.organization_id = $1', visible('c.id', '$2')];
  if (f.search?.trim()) {
    params.push(`%${f.search.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(c.name ilike ${p} or c.trade_name ilike ${p} or c.city ilike ${p} or c.segment ilike ${p})`);
  }
  if (isManager(user) && f.seller === 'none') {
    where.push('not exists (select 1 from landing_pages l where l.company_id = c.id and l.seller_id is not null)');
  } else if (isManager(user) && f.seller && uuidParam.safeParse(f.seller).success) {
    params.push(f.seller);
    where.push(`exists (select 1 from landing_pages l where l.company_id = c.id and l.seller_id = $${params.length})`);
  }
  const { rows } = await query(
    `select c.id, coalesce(c.trade_name, c.name) as name, c.segment, c.city, c.state, c.whatsapp, c.mobile, c.phone, c.email,
            ${prospectingState('c')} as prospecting,
            (select string_agg(distinct s.name, ', ') from landing_pages l join users s on s.id = l.seller_id where l.company_id = c.id) as seller_names,
            (select count(*)::int from lp_crm_contacts ct where ct.company_id = c.id) as contacts,
            (select count(*)::int from lp_crm_deals d join lp_crm_stages st on st.id = d.stage_id where d.company_id = c.id and st.kind = 'open') as open_deals,
            (select coalesce(sum(d.value), 0)::float from lp_crm_deals d join lp_crm_stages st on st.id = d.stage_id where d.company_id = c.id and st.kind = 'open') as open_value,
            (select count(*)::int from lp_crm_tasks t where t.company_id = c.id and not t.done and ($2::uuid is null or t.assignee_id = $2)) as pending_tasks,
            (select coalesce(sum(cv.unread), 0)::int from lp_crm_conversations cv where cv.company_id = c.id) as unread
       from companies c
      where ${where.join(' and ')}
      order by coalesce(c.trade_name, c.name)
      limit 1000`,
    params,
  );
  res.json(rows);
});

crmRouter.get('/companies/:id', async (req, res) => {
  const user = authUser(req);
  const { id } = await ensureCompany(user, uuidParam.parse(req.params.id));
  const scope = sellerScope(user);
  const [company, contacts, deals, tasks, conversations, notes] = await Promise.all([
    one(
      `select c.id, coalesce(c.trade_name, c.name) as name, c.legal_name, c.segment, c.city, c.state, c.address, c.number, c.neighborhood,
              c.phone, c.mobile, c.whatsapp, c.email, c.website, c.instagram,
              (select string_agg(distinct s.name, ', ') from landing_pages l join users s on s.id = l.seller_id where l.company_id = c.id) as seller_names,
              (select l.slug from landing_pages l where l.company_id = c.id and l.status = 'ativa' order by l.created_at limit 1) as lp_slug
         from companies c where c.id = $1`,
      [id],
    ),
    query('select * from lp_crm_contacts where company_id = $1 order by name', [id]),
    query(
      `select d.*, st.name as stage_name, st.color as stage_color, st.kind as stage_kind, ct.name as contact_name
         from lp_crm_deals d join lp_crm_stages st on st.id = d.stage_id left join lp_crm_contacts ct on ct.id = d.contact_id
        where d.company_id = $1 order by d.created_at desc`,
      [id],
    ),
    query(
      `select t.*, u.name as assignee_name from lp_crm_tasks t left join users u on u.id = t.assignee_id
        where t.company_id = $1 and ($2::uuid is null or t.assignee_id = $2)
        order by t.done, t.due_at nulls last`,
      [id, scope],
    ),
    query(
      `select cv.id, cv.phone, cv.push_name, cv.unread, cv.last_message, cv.last_message_at, ct.name as contact_name
         from lp_crm_conversations cv left join lp_crm_contacts ct on ct.id = cv.contact_id
        where cv.company_id = $1 order by cv.last_message_at desc nulls last`,
      [id],
    ),
    query('select id, author_name, note, created_at from prospecting_notes where company_id = $1 order by created_at desc limit 20', [id]),
  ]);
  res.json({ company, contacts: contacts.rows, deals: deals.rows, tasks: tasks.rows, conversations: conversations.rows, notes: notes.rows });
});

// ─── Contatos ───────────────────────────────────────────────────────

const ContactSchema = z.object({
  company_id: uuidParam,
  name: z.string().trim().min(1, 'Informe o nome do contato.').max(200),
  job_title: text(120),
  email: text(200),
  phone: text(40),
  whatsapp: text(40),
  notes: longText(3000),
});

crmRouter.get('/contacts/:id', async (req, res) => {
  const user = authUser(req);
  const contact = await ensureContact(user, uuidParam.parse(req.params.id));
  res.json(
    await one(`select ct.*, coalesce(c.trade_name, c.name) as company_name from lp_crm_contacts ct join companies c on c.id = ct.company_id where ct.id = $1`, [
      contact.id,
    ]),
  );
});

crmRouter.post('/contacts', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(ContactSchema, req.body);
  await ensureCompany(user, b.company_id);
  const created = await one(
    `insert into lp_crm_contacts (organization_id, company_id, name, job_title, email, phone, whatsapp, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [user.organizationId, b.company_id, b.name, b.job_title, b.email, b.phone, b.whatsapp, b.notes, user.id],
  ).catch(friendlyDbError);
  await relinkConversations(user.organizationId);
  res.status(201).json(created);
});

crmRouter.put('/contacts/:id', async (req, res) => {
  const user = authUser(req);
  const contact = await ensureContact(user, uuidParam.parse(req.params.id));
  const b = parseBody(ContactSchema, req.body);
  if (b.company_id !== contact.company_id) await ensureCompany(user, b.company_id);
  const updated = await one(
    `update lp_crm_contacts set company_id = $2, name = $3, job_title = $4, email = $5, phone = $6, whatsapp = $7, notes = $8, updated_at = now()
      where id = $1 returning *`,
    [contact.id, b.company_id, b.name, b.job_title, b.email, b.phone, b.whatsapp, b.notes],
  ).catch(friendlyDbError);
  await relinkConversations(user.organizationId);
  res.json(updated);
});

crmRouter.delete('/contacts/:id', async (req, res) => {
  const user = authUser(req);
  const contact = await ensureContact(user, uuidParam.parse(req.params.id));
  await query('delete from lp_crm_contacts where id = $1', [contact.id]);
  await relinkConversations(user.organizationId);
  res.json({ ok: true });
});

// ─── Funil ──────────────────────────────────────────────────────────

async function stagesFor(orgId: string) {
  let { rows } = await query('select id, name, position, color, kind from lp_crm_stages where organization_id = $1 order by position', [orgId]);
  if (!rows.length) {
    // Organização criada depois da migration: recebe as etapas padrão
    await query(
      `insert into lp_crm_stages (organization_id, name, position, color, kind)
       select $1, s.name, s.position, s.color, s.kind from (values
         ('Prospecção', 1, '#71717a', 'open'), ('Qualificação', 2, '#0ea5e9', 'open'), ('Proposta', 3, '#8b5cf6', 'open'),
         ('Negociação', 4, '#f59e0b', 'open'), ('Ganho', 5, '#16a34a', 'won'), ('Perdido', 6, '#dc2626', 'lost')
       ) as s(name, position, color, kind)
       where not exists (select 1 from lp_crm_stages where organization_id = $1)`,
      [orgId],
    );
    ({ rows } = await query('select id, name, position, color, kind from lp_crm_stages where organization_id = $1 order by position', [orgId]));
  }
  return rows;
}

crmRouter.get('/stages', async (req, res) => {
  res.json(await stagesFor(authUser(req).organizationId));
});

// Colunas do funil: as mesmas para toda a organização, então só a gerência altera
const StageSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da coluna.').max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.'),
  kind: z.enum(['open', 'won', 'lost']),
});

async function ensureStage(orgId: string, id: string) {
  const stage = await one<{ id: string }>('select id from lp_crm_stages where id = $1 and organization_id = $2', [id, orgId]);
  if (!stage) throw notFound('Coluna não encontrada.');
  return stage;
}

crmRouter.post('/stages', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const b = parseBody(StageSchema, req.body);
  const created = await one(
    `insert into lp_crm_stages (organization_id, name, color, kind, position)
     values ($1, $2, $3, $4, coalesce((select max(position) from lp_crm_stages where organization_id = $1), 0) + 1)
     returning id, name, position, color, kind`,
    [user.organizationId, b.name, b.color.toLowerCase(), b.kind],
  );
  res.status(201).json(created);
});

crmRouter.put('/stages/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const stage = await ensureStage(user.organizationId, uuidParam.parse(req.params.id));
  const b = parseBody(StageSchema, req.body);
  await query('update lp_crm_stages set name = $2, color = $3, kind = $4 where id = $1', [stage.id, b.name, b.color.toLowerCase(), b.kind]);
  res.json({ ok: true });
});

// Nova ordem das colunas (lista completa de ids, da esquerda para a direita)
crmRouter.put('/stages-order', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const { ids } = parseBody(z.object({ ids: z.array(uuidParam).min(1).max(50) }), req.body);
  const { rowCount } = await query('select 1 from lp_crm_stages where organization_id = $1 and id = any($2::uuid[])', [user.organizationId, ids]);
  const total = await one<{ n: number }>('select count(*)::int as n from lp_crm_stages where organization_id = $1', [user.organizationId]);
  if (rowCount !== ids.length || total?.n !== ids.length) throw badRequest('Lista de colunas desatualizada. Recarregue a página.');
  await query(
    `update lp_crm_stages s set position = o.pos from unnest($2::uuid[]) with ordinality as o(id, pos)
      where s.id = o.id and s.organization_id = $1`,
    [user.organizationId, ids],
  );
  res.json({ ok: true });
});

// Excluir coluna: os negócios dela vão para outra coluna (nada se perde)
crmRouter.delete('/stages/:id', requireRole(...MANAGER_ROLES), async (req, res) => {
  const user = authUser(req);
  const stage = await ensureStage(user.organizationId, uuidParam.parse(req.params.id));
  const moveTo = req.query.move_to ? uuidParam.parse(req.query.move_to) : null;
  const total = await one<{ n: number }>('select count(*)::int as n from lp_crm_stages where organization_id = $1', [user.organizationId]);
  if ((total?.n ?? 0) <= 1) throw badRequest('O funil precisa de pelo menos uma coluna.');
  const deals = await one<{ n: number }>('select count(*)::int as n from lp_crm_deals where stage_id = $1', [stage.id]);
  if (deals?.n) {
    if (!moveTo || moveTo === stage.id) throw badRequest('Escolha para qual coluna vão os negócios desta coluna.');
    await ensureStage(user.organizationId, moveTo);
    await query(
      `update lp_crm_deals set stage_id = $2, updated_at = now(),
              position = position + coalesce((select max(position) from lp_crm_deals where stage_id = $2), 0)
        where stage_id = $1`,
      [stage.id, moveTo],
    );
  }
  await query('delete from lp_crm_stages where id = $1', [stage.id]);
  res.json({ ok: true, moved: deals?.n ?? 0 });
});

crmRouter.get('/deals', async (req, res) => {
  const user = authUser(req);
  const f = z.object({ seller: z.string().max(40).optional() }).parse(req.query);
  const filterSeller = isManager(user) && f.seller && uuidParam.safeParse(f.seller).success ? f.seller : null;
  const { rows } = await query(
    `select d.*, coalesce(c.trade_name, c.name) as company_name, ct.name as contact_name
       from lp_crm_deals d
       join companies c on c.id = d.company_id
       left join lp_crm_contacts ct on ct.id = d.contact_id
      where d.organization_id = $1 and ${visible('c.id', '$2')} and ${assignedTo('c.id', '$3')}
      order by d.position, d.created_at`,
    [user.organizationId, sellerScope(user), filterSeller],
  );
  res.json(rows);
});

const DealSchema = z.object({
  company_id: uuidParam,
  contact_id: uuidParam.nullish(),
  stage_id: uuidParam,
  title: z.string().trim().min(1, 'Informe o título do negócio.').max(200),
  value: z.coerce.number().min(0).max(1e12).default(0),
  expected_close: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .or(z.literal('').transform(() => null)),
  notes: longText(3000),
});

async function checkDealRefs(user: AuthUser, b: z.infer<typeof DealSchema>) {
  await ensureCompany(user, b.company_id);
  const stage = await one('select 1 from lp_crm_stages where id = $1 and organization_id = $2', [b.stage_id, user.organizationId]);
  if (!stage) throw badRequest('Etapa inválida.');
  if (b.contact_id) {
    const ct = await one('select 1 from lp_crm_contacts where id = $1 and company_id = $2', [b.contact_id, b.company_id]);
    if (!ct) throw badRequest('O contato não pertence a esta empresa.');
  }
}

async function ensureDeal(user: AuthUser, id: string) {
  const deal = await one<{ id: string; company_id: string }>('select id, company_id from lp_crm_deals where id = $1 and organization_id = $2', [
    id,
    user.organizationId,
  ]);
  if (!deal) throw notFound('Negócio não encontrado.');
  await ensureCompany(user, deal.company_id);
  return deal;
}

crmRouter.post('/deals', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(DealSchema, req.body);
  await checkDealRefs(user, b);
  const created = await one(
    `insert into lp_crm_deals (organization_id, company_id, contact_id, stage_id, title, value, expected_close, notes, position, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8,
             coalesce((select max(position) from lp_crm_deals where stage_id = $4), 0) + 1, $9)
     returning *`,
    [user.organizationId, b.company_id, b.contact_id ?? null, b.stage_id, b.title, b.value, b.expected_close ?? null, b.notes, user.id],
  );
  res.status(201).json(created);
});

crmRouter.put('/deals/:id', async (req, res) => {
  const user = authUser(req);
  const deal = await ensureDeal(user, uuidParam.parse(req.params.id));
  const b = parseBody(DealSchema, req.body);
  await checkDealRefs(user, b);
  const updated = await one(
    `update lp_crm_deals set company_id = $2, contact_id = $3, stage_id = $4, title = $5, value = $6, expected_close = $7, notes = $8, updated_at = now()
      where id = $1 returning *`,
    [deal.id, b.company_id, b.contact_id ?? null, b.stage_id, b.title, b.value, b.expected_close ?? null, b.notes],
  );
  res.json(updated);
});

crmRouter.patch('/deals/:id/move', async (req, res) => {
  const user = authUser(req);
  const deal = await ensureDeal(user, uuidParam.parse(req.params.id));
  const b = parseBody(z.object({ stage_id: uuidParam }), req.body);
  const stage = await one('select 1 from lp_crm_stages where id = $1 and organization_id = $2', [b.stage_id, user.organizationId]);
  if (!stage) throw badRequest('Etapa inválida.');
  await query(
    `update lp_crm_deals set stage_id = $2, updated_at = now(),
            position = coalesce((select max(position) from lp_crm_deals where stage_id = $2 and id <> $1), 0) + 1
      where id = $1`,
    [deal.id, b.stage_id],
  );
  res.json({ ok: true });
});

crmRouter.delete('/deals/:id', async (req, res) => {
  const user = authUser(req);
  const deal = await ensureDeal(user, uuidParam.parse(req.params.id));
  await query('delete from lp_crm_deals where id = $1', [deal.id]);
  res.json({ ok: true });
});

// ─── Tarefas ────────────────────────────────────────────────────────

crmRouter.get('/tasks', async (req, res) => {
  const user = authUser(req);
  const f = z
    .object({
      done: z.enum(['true', 'false']).optional(),
      due_from: z.string().datetime().optional(),
      due_to: z.string().datetime().optional(),
      assignee: z.string().max(40).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(300),
    })
    .parse(req.query);
  const assignee = isManager(user) ? (f.assignee && uuidParam.safeParse(f.assignee).success ? f.assignee : null) : user.id;
  const { rows } = await query(
    `select t.*, u.name as assignee_name, coalesce(c.trade_name, c.name) as company_name
       from lp_crm_tasks t
       left join users u on u.id = t.assignee_id
       left join companies c on c.id = t.company_id
      where t.organization_id = $1
        and ($2::uuid is null or t.assignee_id = $2)
        and ($3::boolean is null or t.done = $3)
        and ($4::timestamptz is null or t.due_at >= $4)
        and ($5::timestamptz is null or t.due_at <= $5)
      order by case when t.done then t.done_at end desc nulls last, t.due_at nulls last
      limit $6`,
    [user.organizationId, assignee, f.done === undefined ? null : f.done === 'true', f.due_from ?? null, f.due_to ?? null, f.limit],
  );
  res.json(rows);
});

const TaskSchema = z.object({
  title: z.string().trim().min(1, 'Descreva a tarefa.').max(300),
  description: longText(3000),
  due_at: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .or(z.literal('').transform(() => null)),
  company_id: uuidParam.nullish().or(z.literal('').transform(() => null)),
  assignee_id: uuidParam.nullish().or(z.literal('').transform(() => null)),
});

async function taskAssignee(user: AuthUser, requested: string | null | undefined) {
  if (!isManager(user) || !requested) return user.id;
  const ok = await one("select 1 from users where id = $1 and organization_id = $2 and role in ('owner', 'admin', 'seller')", [requested, user.organizationId]);
  if (!ok) throw badRequest('Responsável inválido.');
  return requested;
}

async function ensureTask(user: AuthUser, id: string) {
  const task = await one<{ id: string; assignee_id: string; done: boolean }>(
    'select id, assignee_id, done from lp_crm_tasks where id = $1 and organization_id = $2 and ($3::uuid is null or assignee_id = $3)',
    [id, user.organizationId, sellerScope(user)],
  );
  if (!task) throw notFound('Tarefa não encontrada.');
  return task;
}

crmRouter.post('/tasks', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(TaskSchema, req.body);
  if (b.company_id) await ensureCompany(user, b.company_id);
  const created = await one(
    `insert into lp_crm_tasks (organization_id, title, description, due_at, company_id, assignee_id, created_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [user.organizationId, b.title, b.description, b.due_at ?? null, b.company_id ?? null, await taskAssignee(user, b.assignee_id), user.id],
  );
  // Aviso no CRM para quem criou, o responsável pela tarefa e o(s) vendedor(es) da empresa (cliente)
  await query(
    `insert into lp_crm_task_alerts (task_id, user_id)
     select $1, u.id from users u
      where u.organization_id = $2
        and (u.id = $3 or u.id = $4
             or exists (select 1 from landing_pages lpv join companies cpv on cpv.id = lpv.company_id
                         where lpv.company_id = $5 and lpv.seller_id = u.id and ${inProspecting('cpv')}))
     on conflict do nothing`,
    [created.id, user.organizationId, user.id, created.assignee_id, b.company_id ?? null],
  );
  res.status(201).json(created);
});

// Tarefas novas que a pessoa ainda não fechou no popup do CRM
crmRouter.get('/task-alerts', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(
    `select t.id, t.title, t.description, t.due_at, t.company_id, coalesce(c.trade_name, c.name) as company_name,
            u.name as assignee_name, cb.name as created_by_name, a.created_at
       from lp_crm_task_alerts a
       join lp_crm_tasks t on t.id = a.task_id
       left join companies c on c.id = t.company_id
       left join users u on u.id = t.assignee_id
       left join users cb on cb.id = t.created_by
      where a.user_id = $1 and a.dismissed_at is null and t.organization_id = $2
      order by a.created_at`,
    [user.id, user.organizationId],
  );
  res.json(rows);
});

crmRouter.post('/task-alerts/dismiss', async (req, res) => {
  const user = authUser(req);
  const { ids } = parseBody(z.object({ ids: z.array(uuidParam).min(1).max(200) }), req.body);
  await query('update lp_crm_task_alerts set dismissed_at = now() where user_id = $1 and task_id = any($2::uuid[]) and dismissed_at is null', [user.id, ids]);
  res.json({ ok: true });
});

crmRouter.put('/tasks/:id', async (req, res) => {
  const user = authUser(req);
  const task = await ensureTask(user, uuidParam.parse(req.params.id));
  const b = parseBody(TaskSchema, req.body);
  if (b.company_id) await ensureCompany(user, b.company_id);
  const updated = await one(
    `update lp_crm_tasks set title = $2, description = $3, due_at = $4, company_id = $5, assignee_id = $6, updated_at = now()
      where id = $1 returning *`,
    [task.id, b.title, b.description, b.due_at ?? null, b.company_id ?? null, await taskAssignee(user, b.assignee_id ?? task.assignee_id)],
  );
  res.json(updated);
});

crmRouter.patch('/tasks/:id/done', async (req, res) => {
  const user = authUser(req);
  const task = await ensureTask(user, uuidParam.parse(req.params.id));
  const { done } = parseBody(z.object({ done: z.boolean() }), req.body);
  await query('update lp_crm_tasks set done = $2, done_at = case when $2 then now() end, updated_at = now() where id = $1', [task.id, done]);
  res.json({ ok: true });
});

crmRouter.delete('/tasks/:id', async (req, res) => {
  const user = authUser(req);
  const task = await ensureTask(user, uuidParam.parse(req.params.id));
  await query('delete from lp_crm_tasks where id = $1', [task.id]);
  res.json({ ok: true });
});

// ─── WhatsApp: conversas e mensagens ────────────────────────────────

crmRouter.get('/conversations', async (req, res) => {
  const user = authUser(req);
  const f = z
    .object({
      unlinked: z.enum(['true', 'false']).optional(),
      label: z.string().max(40).optional(),
      search: z.string().max(200).optional(),
    })
    .parse(req.query);
  // Empresa cadastrada/alterada depois da 1ª mensagem: tenta ligar as conversas que ainda estão sem empresa
  if (isManager(user)) await relinkConversations(user.organizationId, { onlyUnlinked: true });
  const term = f.search?.trim() ? `%${f.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const digits = f.search?.replace(/\D/g, '') ?? '';
  const phoneTerm = digits.length >= 4 ? `%${digits.slice(-8)}%` : null;
  const label = f.label === 'none' ? 'none' : f.label && uuidParam.safeParse(f.label).success ? f.label : null;
  const { rows } = await query(
    `select cv.id, cv.phone, cv.push_name, cv.contact_id, cv.company_id, cv.unread, cv.last_message, cv.last_message_at,
            ct.name as contact_name, coalesce(c.trade_name, c.name) as company_name,
            coalesce((select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) order by lower(l.name))
                        from lp_crm_conversation_labels cl join lp_crm_labels l on l.id = cl.label_id
                       where cl.conversation_id = cv.id), '[]') as labels,
            -- Busca pelo texto: a mensagem mais recente que contém o termo (para mostrar o trecho)
            case when $4::text is null then null else (
              select json_build_object('id', m.id, 'body', left(m.body, 300), 'created_at', m.created_at)
                from lp_crm_messages m
               where m.conversation_id = cv.id and m.hidden_at is null and m.revoked_at is null and m.body ilike $4
               order by m.created_at desc limit 1) end as matched
       from lp_crm_conversations cv
       left join lp_crm_contacts ct on ct.id = cv.contact_id
       left join companies c on c.id = cv.company_id
      where cv.organization_id = $1
        and ${convVisible('cv', '$2')}
        and (not $3 or cv.company_id is null)
        and ($4::text is null
             or ct.name ilike $4 or cv.push_name ilike $4 or c.name ilike $4 or c.trade_name ilike $4
             or ($5::text is not null and cv.wa_key like $5)
             or exists (select 1 from lp_crm_messages m where m.conversation_id = cv.id and m.hidden_at is null
                         and m.revoked_at is null and m.body ilike $4))
        and ($6::text is null
             or ($6 = 'none' and not exists (select 1 from lp_crm_conversation_labels cl where cl.conversation_id = cv.id))
             or ($6 <> 'none' and exists (select 1 from lp_crm_conversation_labels cl where cl.conversation_id = cv.id and cl.label_id::text = $6)))
      order by cv.last_message_at desc nulls last
      limit 300`,
    [user.organizationId, sellerScope(user), isManager(user) && f.unlinked === 'true', term, phoneTerm, label],
  );
  res.json(rows);
});

// ─── Etiquetas das conversas ────────────────────────────────────────

const LabelSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da etiqueta.').max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.'),
});

function labelError(err: unknown): never {
  if ((err as { constraint?: string }).constraint === 'lp_crm_labels_name_uniq') {
    throw new AppError(409, 'Já existe uma etiqueta com esse nome.', 'CRM_DUP_LABEL');
  }
  throw err;
}

crmRouter.get('/labels', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(
    `select l.id, l.name, l.color,
            (select count(*)::int from lp_crm_conversation_labels cl where cl.label_id = l.id) as conversations
       from lp_crm_labels l where l.organization_id = $1 order by lower(l.name)`,
    [user.organizationId],
  );
  res.json(rows);
});

crmRouter.post('/labels', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(LabelSchema, req.body);
  const created = await one('insert into lp_crm_labels (organization_id, name, color) values ($1, $2, $3) returning id, name, color', [
    user.organizationId,
    b.name,
    b.color.toLowerCase(),
  ]).catch(labelError);
  res.status(201).json(created);
});

crmRouter.put('/labels/:id', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(LabelSchema, req.body);
  const updated = await one('update lp_crm_labels set name = $3, color = $4 where id = $1 and organization_id = $2 returning id, name, color', [
    uuidParam.parse(req.params.id),
    user.organizationId,
    b.name,
    b.color.toLowerCase(),
  ]).catch(labelError);
  if (!updated) throw notFound('Etiqueta não encontrada.');
  res.json(updated);
});

crmRouter.delete('/labels/:id', async (req, res) => {
  const user = authUser(req);
  const { rowCount } = await query('delete from lp_crm_labels where id = $1 and organization_id = $2', [uuidParam.parse(req.params.id), user.organizationId]);
  if (!rowCount) throw notFound('Etiqueta não encontrada.');
  res.json({ ok: true });
});

// ─── Mensagens prontas do WhatsApp ("/atalho" no campo de mensagem) ─────────
// Visibilidade: "all" = toda a equipe; "users" = quem criou e os subusuários escolhidos.
// Editar/excluir: quem criou, dono ou admin. Dono/admin veem todas (para gerenciar).

const QuickReplySchema = z.object({
  // Atalho sem a barra e sem espaços: "/valor" → "valor"
  shortcut: z
    .string()
    .trim()
    .transform((v) => v.replace(/^\/+/, '').toLowerCase())
    .pipe(
      z
        .string()
        .min(1, 'Informe o nome (atalho) da mensagem.')
        .max(30, 'Nome muito longo (máximo de 30 caracteres).')
        .regex(/^[\p{L}\p{N}_-]+$/u, 'Use só letras, números, - ou _ no nome (sem espaços).'),
    ),
  body: z.string().trim().min(1, 'Escreva o texto da mensagem.').max(4000, 'Texto muito longo (máximo de 4.000 caracteres).'),
  visibility: z.enum(['all', 'users']).default('all'),
  user_ids: z.array(uuidParam).max(200).default([]),
});

function quickReplyError(err: unknown): never {
  if ((err as { constraint?: string }).constraint === 'lp_crm_quick_replies_shortcut_uniq') {
    throw new AppError(409, 'Já existe uma mensagem pronta com esse nome.', 'CRM_DUP_QUICK_REPLY');
  }
  throw err;
}

/** Mensagens que o usuário vê, com quem pode usar e se ele pode usar/editar. */
async function listQuickReplies(user: AuthUser, id?: string) {
  const manager = isManager(user);
  const { rows } = await query(
    `select q.id, q.shortcut, q.body, q.updated_at, q.visibility, q.created_by, cu.name as created_by_name,
            coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name) order by u.name)
                        from lp_crm_quick_reply_users qu join users u on u.id = qu.user_id
                       where qu.quick_reply_id = q.id), '[]') as users,
            (q.visibility = 'all' or q.created_by = $2
               or exists (select 1 from lp_crm_quick_reply_users qu where qu.quick_reply_id = q.id and qu.user_id = $2)) as can_use,
            ($3 or q.created_by = $2) as can_edit
       from lp_crm_quick_replies q left join users cu on cu.id = q.created_by
      where q.organization_id = $1 and ($4::uuid is null or q.id = $4)
        and ($3 or q.visibility = 'all' or q.created_by = $2
             or exists (select 1 from lp_crm_quick_reply_users qu where qu.quick_reply_id = q.id and qu.user_id = $2))
      order by lower(q.shortcut)`,
    [user.organizationId, user.id, manager, id ?? null],
  );
  return rows;
}

/** Subusuários escolhidos: só da própria organização (e sem repetir quem criou). */
async function saveQuickReplyUsers(user: AuthUser, quickReplyId: string, visibility: string, userIds: string[], createdBy: string | null) {
  await query('delete from lp_crm_quick_reply_users where quick_reply_id = $1', [quickReplyId]);
  if (visibility !== 'users' || !userIds.length) return;
  await query(
    `insert into lp_crm_quick_reply_users (quick_reply_id, user_id)
     select $1, u.id from users u where u.organization_id = $2 and u.id = any($3::uuid[]) and u.id is distinct from $4
     on conflict do nothing`,
    [quickReplyId, user.organizationId, userIds, createdBy],
  );
}

/** Mensagem que o usuário pode editar (criou, ou é dono/admin); senão 404. */
async function editableQuickReply(user: AuthUser, id: string) {
  const row = await one<{ id: string; created_by: string | null }>('select id, created_by from lp_crm_quick_replies where id = $1 and organization_id = $2', [
    id,
    user.organizationId,
  ]);
  if (!row) throw notFound('Mensagem pronta não encontrada.');
  if (!isManager(user) && row.created_by !== user.id) throw new AppError(403, 'Só quem criou esta mensagem pode alterá-la.', 'FORBIDDEN');
  return row;
}

crmRouter.get('/quick-replies', async (req, res) => {
  res.json(await listQuickReplies(authUser(req)));
});

crmRouter.post('/quick-replies', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(QuickReplySchema, req.body);
  const created = await one<{ id: string }>(
    `insert into lp_crm_quick_replies (organization_id, shortcut, body, visibility, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [user.organizationId, b.shortcut, b.body, b.visibility, user.id],
  ).catch(quickReplyError);
  await saveQuickReplyUsers(user, created!.id, b.visibility, b.user_ids, user.id);
  res.status(201).json((await listQuickReplies(user, created!.id))[0]);
});

crmRouter.put('/quick-replies/:id', async (req, res) => {
  const user = authUser(req);
  const current = await editableQuickReply(user, uuidParam.parse(req.params.id));
  const b = parseBody(QuickReplySchema, req.body);
  await query(`update lp_crm_quick_replies set shortcut = $2, body = $3, visibility = $4, updated_at = now() where id = $1`, [
    current.id,
    b.shortcut,
    b.body,
    b.visibility,
  ]).catch(quickReplyError);
  await saveQuickReplyUsers(user, current.id, b.visibility, b.user_ids, current.created_by);
  res.json((await listQuickReplies(user, current.id))[0]);
});

crmRouter.delete('/quick-replies/:id', async (req, res) => {
  const user = authUser(req);
  const current = await editableQuickReply(user, uuidParam.parse(req.params.id));
  await query('delete from lp_crm_quick_replies where id = $1', [current.id]);
  res.json({ ok: true });
});

// Etiquetas de uma conversa: a lista enviada substitui a anterior
crmRouter.put('/conversations/:id/labels', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  const { label_ids } = parseBody(z.object({ label_ids: z.array(uuidParam).max(30) }), req.body);
  const valid = label_ids.length
    ? (
        await query<{ id: string }>('select id from lp_crm_labels where organization_id = $1 and id = any($2::uuid[])', [user.organizationId, label_ids])
      ).rows.map((r) => r.id)
    : [];
  await query('delete from lp_crm_conversation_labels where conversation_id = $1', [conv.id]);
  if (valid.length) {
    await query('insert into lp_crm_conversation_labels (conversation_id, label_id) select $1, unnest($2::uuid[]) on conflict do nothing', [conv.id, valid]);
  }
  res.json({ ok: true });
});

// Busca mensagens novas direto na Evolution (complementa o webhook); falhas não atrapalham a tela
crmRouter.post('/sync', async (req, res) => {
  const user = authUser(req);
  try {
    res.json(await syncRecent(user.organizationId));
  } catch (err) {
    console.error('[crm] sync', err);
    res.json({ added: 0, skipped: 'error' });
  }
});

// "Nova conversa": empresas e contatos visíveis que têm WhatsApp (ou celular) cadastrado
crmRouter.get('/whatsapp-targets', async (req, res) => {
  const user = authUser(req);
  const { search } = z.object({ search: z.string().max(100).optional() }).parse(req.query);
  const term = search?.trim() ? `%${search.trim()}%` : null;
  const digits = search?.replace(/\D/g, '') ?? '';
  const phoneTerm = digits.length >= 4 ? `%${digits.slice(-8)}%` : null;
  const params = [user.organizationId, sellerScope(user), term, phoneTerm];
  const [companies, contacts] = await Promise.all([
    query(
      `select c.id, coalesce(c.trade_name, c.name) as name, coalesce(c.whatsapp, c.mobile) as whatsapp, c.city
         from companies c
        where c.organization_id = $1 and ${visible('c.id', '$2')} and coalesce(c.whatsapp, c.mobile) is not null
          and (($3::text is null and $4::text is null) or c.name ilike $3 or c.trade_name ilike $3
               or regexp_replace(coalesce(c.whatsapp, c.mobile), '\\D', '', 'g') like $4)
        order by coalesce(c.trade_name, c.name) limit 20`,
      params,
    ),
    query(
      `select ct.id, ct.name, ct.whatsapp, coalesce(c.trade_name, c.name) as company_name
         from lp_crm_contacts ct join companies c on c.id = ct.company_id
        where ct.organization_id = $1 and ${visible('c.id', '$2')} and ct.whatsapp is not null
          and (($3::text is null and $4::text is null) or ct.name ilike $3 or c.name ilike $3 or ct.wa_key like $4)
        order by ct.name limit 20`,
      params,
    ),
  ]);
  res.json({ companies: companies.rows, contacts: contacts.rows });
});

crmRouter.get('/unread', async (req, res) => {
  const user = authUser(req);
  const r = await one<{ total: number }>(
    `select coalesce(sum(cv.unread), 0)::int as total from lp_crm_conversations cv
      where cv.organization_id = $1 and cv.unread > 0
        and ${convVisible('cv', '$2')}`,
    [user.organizationId, sellerScope(user)],
  );
  res.json({ total: r?.total ?? 0 });
});

crmRouter.get('/conversations/:id/messages', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  const { rows } = await query(
    `select * from (
       select m.id, m.direction, m.type, m.body, m.status, m.created_at, u.name as sent_by_name, m.media_mime, m.file_name,
              m.my_reaction, m.their_reaction, m.wa_message_id is not null and m.revoked_at is null as can_react,
              m.revoked_at is not null as revoked,
              (m.direction = 'out' and m.wa_message_id is not null and m.revoked_at is null and m.created_at > now() - interval '2 days') as can_revoke,
              m.edited_at,
              (m.direction = 'out' and m.type = 'text' and m.wa_message_id is not null and m.revoked_at is null
                and m.created_at > now() - interval '15 minutes') as can_edit
         from lp_crm_messages m left join users u on u.id = m.sent_by
        where m.conversation_id = $1 and m.hidden_at is null order by m.created_at desc limit 200
     ) x order by created_at`,
    [conv.id],
  );
  res.json(rows);
});

crmRouter.post('/conversations/:id/read', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  // Gerência abrindo conversa de cliente com vendedor atribuído: continua não lida (para o vendedor ver)
  if (isManager(user)) {
    const withSeller = await query(
      `select 1 from lp_crm_conversations cv join landing_pages l on l.company_id = cv.company_id
        where cv.id = $1 and l.seller_id is not null limit 1`,
      [conv.id],
    );
    if (withSeller.rowCount) return res.json({ ok: true, skipped: true });
  }
  await query('update lp_crm_conversations set unread = 0 where id = $1', [conv.id]);
  // Confirmação de leitura para o cliente; se o WhatsApp falhar, a conversa continua marcada como lida aqui
  await markReadOnWhatsapp(user.organizationId, conv.id).catch((err) => console.error('[crm] markRead', err));
  res.json({ ok: true });
});

/** "Marcar como não lida" (botão direito na lista de conversas): volta a aparecer como não lida, só no CRM. */
crmRouter.post('/conversations/:id/unread', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  await query('update lp_crm_conversations set unread = greatest(unread, 1) where id = $1', [conv.id]);
  res.json({ ok: true });
});

// Apagar mensagem: "para mim" some do CRM; "para todos" apaga também no WhatsApp do cliente
crmRouter.delete('/messages/:id', async (req, res) => {
  const user = authUser(req);
  const { everyone } = z.object({ everyone: z.enum(['true', 'false']).optional() }).parse(req.query);
  const msg = await one<{
    id: string;
    conversation_id: string;
    direction: string;
    wa_message_id: string | null;
    revoked_at: string | null;
    created_at: string;
  }>('select id, conversation_id, direction, wa_message_id, revoked_at, created_at from lp_crm_messages where id = $1 and hidden_at is null', [
    uuidParam.parse(req.params.id),
  ]);
  if (!msg) throw notFound('Mensagem não encontrada.');
  const conv = await ensureConversation(user, msg.conversation_id);

  if (everyone === 'true') {
    if (msg.direction !== 'out' || !msg.wa_message_id) throw badRequest('Só dá para apagar para todos as mensagens enviadas por vocês.');
    if (msg.revoked_at) throw badRequest('Esta mensagem já foi apagada para todos.');
    if (Date.now() - new Date(msg.created_at).getTime() > 2 * 24 * 3600 * 1000) {
      throw badRequest('O WhatsApp só deixa apagar para todos até cerca de 2 dias depois do envio.');
    }
    const cfg = await loadConfig(user.organizationId);
    await evolution(cfg, 'DELETE', `/chat/deleteMessageForEveryone/${cfg?.instance}`, {
      id: msg.wa_message_id,
      remoteJid: conv.remote_jid ?? `${normalizeNumber(conv.phone)}@s.whatsapp.net`,
      fromMe: true,
    });
    await markRevoked(user.organizationId, msg.wa_message_id);
    return res.json({ ok: true });
  }

  await query('update lp_crm_messages set hidden_at = now() where id = $1', [msg.id]);
  await query('delete from lp_crm_media where message_id = $1', [msg.id]);
  await refreshConversationSummary(msg.conversation_id);
  res.json({ ok: true });
});

// Editar mensagem enviada (só texto, até 15 minutos depois do envio, como no WhatsApp)
crmRouter.put('/messages/:id', async (req, res) => {
  const user = authUser(req);
  const { text } = parseBody(z.object({ text: z.string().trim().min(1, 'A mensagem não pode ficar vazia.').max(4000) }), req.body);
  const msg = await one<{
    id: string;
    conversation_id: string;
    direction: string;
    type: string;
    body: string | null;
    wa_message_id: string | null;
    revoked_at: string | null;
    created_at: string;
  }>('select id, conversation_id, direction, type, body, wa_message_id, revoked_at, created_at from lp_crm_messages where id = $1 and hidden_at is null', [
    uuidParam.parse(req.params.id),
  ]);
  if (!msg) throw notFound('Mensagem não encontrada.');
  const conv = await ensureConversation(user, msg.conversation_id);
  if (msg.direction !== 'out' || !msg.wa_message_id) throw badRequest('Só dá para editar as mensagens enviadas por vocês.');
  if (msg.type !== 'text') throw badRequest('Só dá para editar mensagens de texto.');
  if (msg.revoked_at) throw badRequest('Esta mensagem foi apagada.');
  if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MS) {
    throw badRequest('O WhatsApp só deixa editar até 15 minutos depois do envio.');
  }
  if (text === msg.body) return res.json({ ok: true });
  const remoteJid = conv.remote_jid ?? `${normalizeNumber(conv.phone)}@s.whatsapp.net`;
  const cfg = await loadConfig(user.organizationId);
  await evolution(cfg, 'POST', `/chat/updateMessage/${cfg?.instance}`, {
    number: jidNumber(remoteJid),
    key: { remoteJid, fromMe: true, id: msg.wa_message_id },
    text,
  });
  await markEdited(user.organizationId, msg.wa_message_id, text);
  res.json({ ok: true });
});

// Reação do número central numa mensagem (emoji vazio remove), como no WhatsApp
crmRouter.post('/messages/:id/reaction', async (req, res) => {
  const user = authUser(req);
  const { emoji } = parseBody(z.object({ emoji: z.string().max(16) }), req.body);
  const msg = await one<{ id: string; conversation_id: string; direction: string; wa_message_id: string | null }>(
    'select id, conversation_id, direction, wa_message_id from lp_crm_messages where id = $1',
    [uuidParam.parse(req.params.id)],
  );
  if (!msg) throw notFound('Mensagem não encontrada.');
  const conv = await ensureConversation(user, msg.conversation_id);
  if (!msg.wa_message_id) throw badRequest('Não dá para reagir a esta mensagem.');
  const cfg = await loadConfig(user.organizationId);
  await evolution(cfg, 'POST', `/message/sendReaction/${cfg?.instance}`, {
    key: { remoteJid: conv.remote_jid ?? `${normalizeNumber(conv.phone)}@s.whatsapp.net`, fromMe: msg.direction === 'out', id: msg.wa_message_id },
    reaction: emoji,
  });
  await query('update lp_crm_messages set my_reaction = $2 where id = $1', [msg.id, emoji || null]);
  res.json({ ok: true });
});

const SendSchema = z.object({
  conversation_id: uuidParam.optional(),
  contact_id: uuidParam.optional(),
  company_id: uuidParam.optional(),
  phone: z.string().trim().max(30).optional(),
  text: z.string().trim().min(1, 'Mensagem vazia.').max(4000),
});

type SendTarget = { conversation_id?: string; contact_id?: string; company_id?: string; phone?: string };

/** Número de destino (conversa, contato, WhatsApp da empresa ou número avulso), respeitando a carteira do vendedor. */
async function resolveTarget(user: AuthUser, b: SendTarget) {
  // Enviando pelo WhatsApp da empresa: a conversa fica com ela (o número pode estar em mais de uma empresa)
  if (b.conversation_id) {
    const conv = await ensureConversation(user, b.conversation_id);
    return { number: conv.remote_jid ? jidNumber(conv.remote_jid) : normalizeNumber(conv.phone), companyTarget: null, startedBy: null };
  }
  if (b.contact_id) {
    const ct = await ensureContact(user, b.contact_id);
    if (!ct.whatsapp) throw badRequest('Este contato não tem WhatsApp cadastrado.');
    return { number: normalizeNumber(ct.whatsapp), companyTarget: null, startedBy: null };
  }
  if (b.company_id) {
    const co = await ensureCompany(user, b.company_id);
    const n = co.whatsapp || co.mobile;
    if (!n) throw badRequest('Esta empresa não tem WhatsApp cadastrado.');
    return { number: normalizeNumber(n), companyTarget: co.id as string | null, startedBy: null };
  }
  // Número fora do cadastro: a conversa nasce sem empresa e fica com quem a iniciou (started_by)
  if (b.phone) {
    if (!(await canChatFreeNumber(user))) throw new AppError(403, 'Você não tem permissão para conversar com número fora do cadastro.', 'FORBIDDEN');
    const number = normalizeNumber(b.phone);
    if (number.length < 10 || number.length > 15) throw badRequest('Número de WhatsApp inválido.');
    // Vendedor: o número não pode ser de empresa, contato ou conversa de outra carteira
    const scope = sellerScope(user);
    if (scope) {
      const taken = await one(
        `select 1 from (
           select cv.company_id, cv.started_by from lp_crm_conversations cv where cv.organization_id = $1 and cv.wa_key = lp_crm_wa_key($2)
           union all
           select ct.company_id, null from lp_crm_contacts ct where ct.organization_id = $1 and ct.wa_key = lp_crm_wa_key($2)
           union all
           select co.id, null from companies co
            where co.organization_id = $1 and (lp_crm_wa_key(co.whatsapp) = lp_crm_wa_key($2) or lp_crm_wa_key(co.mobile) = lp_crm_wa_key($2))
         ) x
         where (x.company_id is not null and not ${visible('x.company_id', '$3')}) or (x.company_id is null and x.started_by <> $3)
         limit 1`,
        [user.organizationId, number, scope],
      );
      if (taken) throw new AppError(409, 'Este número já é de um cliente de outra carteira.', 'CRM_NUMBER_TAKEN');
    }
    return { number, companyTarget: null, startedBy: user.id as string | null };
  }
  throw badRequest('Informe a conversa, o contato, a empresa ou o número.');
}

/** Envia pela Evolution traduzindo "número sem WhatsApp" para uma mensagem clara. */
async function sendViaEvolution(orgId: string, path: string, body: unknown) {
  const cfg = await loadConfig(orgId);
  try {
    return await evolution<any>(cfg, 'POST', `${path}/${cfg?.instance}`, body);
  } catch (err) {
    const status = (err as { evolutionStatus?: number }).evolutionStatus;
    if (status === 400 && /exists|not.*whatsapp/i.test((err as { evolutionMessage?: string }).evolutionMessage ?? '')) {
      throw badRequest('Este número não tem WhatsApp.');
    }
    throw err;
  }
}

/** Grava a mensagem enviada e liga a conversa à empresa escolhida. */
async function recordSent(
  user: AuthUser,
  number: string,
  companyTarget: string | null,
  startedBy: string | null,
  sent: any,
  msg: { type: string; body: string | null; mediaMime?: string | null; fileName?: string | null },
) {
  const jid: string = sent?.key?.remoteJid ?? `${number}@s.whatsapp.net`;
  const r = await registerMessage({
    orgId: user.organizationId,
    phone: jidNumber(jid),
    remoteJid: jid,
    pushName: null,
    direction: 'out',
    waMessageId: sent?.key?.id ?? null,
    sentBy: user.id,
    ...msg,
  });
  if (companyTarget) {
    await query('update lp_crm_conversations set company_id = $2 where id = $1 and contact_id is null', [r.conversationId, companyTarget]);
  }
  if (startedBy) await query('update lp_crm_conversations set started_by = coalesce(started_by, $2) where id = $1', [r.conversationId, startedBy]);
  return r;
}

crmRouter.post('/messages', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(SendSchema, req.body);
  const { number, companyTarget, startedBy } = await resolveTarget(user, b);
  const sent = await sendViaEvolution(user.organizationId, '/message/sendText', { number, text: b.text });
  const { conversationId } = await recordSent(user, number, companyTarget, startedBy, sent, { type: 'text', body: b.text });
  res.status(201).json({ conversation_id: conversationId });
});

// Imagem, GIF, vídeo, documento ou áudio (o áudio vai como mensagem de voz). Arquivo em base64, até ~3 MB.
const MediaSchema = z.object({
  conversation_id: uuidParam.optional(),
  contact_id: uuidParam.optional(),
  company_id: uuidParam.optional(),
  phone: z.string().trim().max(30).optional(),
  kind: z.enum(['image', 'gif', 'video', 'audio', 'document']),
  mime: z
    .string()
    .max(100)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'Tipo de arquivo inválido.'),
  file_name: z.string().trim().max(200).optional(),
  data: z.string().min(1).max(4_300_000),
  caption: z.string().trim().max(1000).optional(),
});

/** Envia uma mídia (base64) para o destino, grava a mensagem e guarda o arquivo para mostrar no CRM. */
async function sendMediaMessage(
  user: AuthUser,
  target: SendTarget,
  b: { kind: 'image' | 'gif' | 'video' | 'audio' | 'document'; mime: string; data: string; file_name?: string; caption?: string; gifPlayback?: boolean },
) {
  const bytes = Buffer.from(b.data, 'base64');
  if (!bytes.length) throw badRequest('Arquivo vazio.');
  const { number, companyTarget, startedBy } = await resolveTarget(user, target);
  const caption = b.caption || undefined;
  const sent =
    b.kind === 'audio'
      ? await sendViaEvolution(user.organizationId, '/message/sendWhatsAppAudio', { number, audio: b.data })
      : await sendViaEvolution(user.organizationId, '/message/sendMedia', {
          number,
          // GIF em MP4 (como os do WhatsApp) vai como vídeo; GIF em image/gif, como imagem. Vídeo e documento com o tipo próprio
          mediatype: b.kind === 'gif' ? (b.mime.startsWith('video/') ? 'video' : 'image') : b.kind,
          mimetype: b.mime,
          media: b.data,
          caption,
          fileName: b.file_name || undefined,
          // GIF de verdade (MP4 que toca sozinho em loop): só a Evolution ajustada respeita (deploy/evolution-gif)
          ...(b.gifPlayback ? { gifPlayback: true } : {}),
        });
  const r = await recordSent(user, number, companyTarget, startedBy, sent, {
    type: b.kind,
    body: caption ?? null,
    mediaMime: b.mime,
    fileName: b.file_name ?? null,
  });
  // Guarda o arquivo enviado para mostrar no CRM sem baixar de novo
  if (r.messageId) {
    await query('insert into lp_crm_media (message_id, mime, data) values ($1, $2, $3) on conflict (message_id) do nothing', [
      r.messageId,
      b.kind === 'audio' ? b.mime.split(';')[0] : b.mime,
      bytes,
    ]);
  }
  return r.conversationId;
}

crmRouter.post('/messages/media', async (req, res) => {
  const b = parseBody(MediaSchema, req.body);
  res.status(201).json({ conversation_id: await sendMediaMessage(authUser(req), b, b) });
});

// ─── GIFs (GIPHY): galeria como a do teclado do celular ─────────────

const GIPHY = 'https://api.giphy.com/v1/gifs';
const GIF_MAX_BYTES = 3 * 1024 * 1024;
/** Só arquivos do próprio GIPHY são baixados para enviar (nada de endereço qualquer vindo do navegador). */
const GIPHY_MEDIA = /^https:\/\/media\d*\.giphy\.com\//i;

async function giphy(path: string, params: Record<string, string>) {
  // Chave cadastrada em Configurações (criptografada) ou a variável GIPHY_API_KEY do servidor
  const [key] = await aiKeyStore.rotation('giphy', env.giphyApiKey);
  if (!key) throw new AppError(503, 'Galeria de GIFs não configurada: cadastre a chave do GIPHY em Configurações.', 'GIF_NOT_CONFIGURED');
  const qs = new URLSearchParams({ api_key: key.key, ...params });
  const res = await fetch(`${GIPHY}${path}?${qs}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw new AppError(502, `A galeria de GIFs não respondeu${res ? ` (${res.status})` : ''}. Tente de novo.`, 'GIF_ERROR');
  return (await res.json()) as { data: any; pagination?: { offset: number; count: number; total_count: number } };
}

// Busca (ou os GIFs em alta, sem termo); 24 por página
crmRouter.get('/gifs', async (req, res) => {
  const f = z.object({ q: z.string().trim().max(80).optional(), offset: z.coerce.number().int().min(0).max(4999).default(0) }).parse(req.query);
  const params = { limit: '24', offset: String(f.offset), rating: 'pg', lang: 'pt', bundle: 'messaging_non_clips' };
  const r = f.q ? await giphy('/search', { ...params, q: f.q }) : await giphy('/trending', params);
  const items = (Array.isArray(r.data) ? r.data : [])
    .map((g: any) => {
      const p = g.images?.fixed_width_small ?? g.images?.fixed_width ?? g.images?.preview_gif;
      return p?.url
        ? { id: String(g.id), title: String(g.title ?? ''), preview: String(p.url), width: Number(p.width) || 1, height: Number(p.height) || 1 }
        : null;
    })
    .filter(Boolean);
  const pg = r.pagination;
  const next = pg && pg.offset + pg.count < Math.min(pg.total_count, 5000) ? pg.offset + pg.count : null;
  res.json({ items, next_offset: next });
});

/** A Evolution desta organização aceita gifPlayback (versão ajustada): GIF vai como GIF de verdade. */
async function gifPlaybackOn(orgId: string) {
  return !!(await one<{ gif_playback: boolean }>('select gif_playback from lp_crm_whatsapp where organization_id = $1', [orgId]))?.gif_playback;
}

const downloadGif = async (u: string) => {
  const file = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const data = file?.ok ? Buffer.from(await file.arrayBuffer()) : null;
  return data?.length && data.length <= GIF_MAX_BYTES ? data : null;
};

/**
 * Imagem animada (GIF ou figurinha WebP) como figurinha: o GIF vira WebP 512×512 inteiro, sem corte, sobre
 * fundo transparente, e vai por um link temporário ".gif" deste sistema (é assim que a Evolution reconhece
 * figurinha animada). Rodando no computador (a Evolution não alcança o link), vai `fallbackUrl` ou o arquivo.
 */
async function sendAsSticker(user: AuthUser, target: SendTarget, image: Buffer, mime: string, fallbackUrl?: string) {
  const { number, companyTarget, startedBy } = await resolveTarget(user, target);
  const cfg = await loadConfig(user.organizationId);
  const reachable = !!cfg && canSetWebhook(cfg);
  const sticker = !reachable ? null : mime === 'image/webp' && image.length <= 500 * 1024 ? image : await gifToSticker(image).catch(() => null);
  let stickerRef = fallbackUrl ?? image.toString('base64');
  if (sticker) {
    void query(`delete from lp_crm_sticker_files where created_at < now() - interval '1 day'`).catch(() => {});
    const row = await one<{ id: string }>('insert into lp_crm_sticker_files (data) values ($1) returning id', [sticker]);
    stickerRef = `${env.appUrl}/api/crm-webhook/sticker/${row!.id}.gif`;
  }
  const sent = await sendViaEvolution(user.organizationId, '/message/sendSticker', { number, sticker: stickerRef });
  const shown = sticker ? { mime: 'image/webp', data: sticker } : { mime, data: image };
  const r = await recordSent(user, number, companyTarget, startedBy, sent, { type: 'sticker', body: null, mediaMime: shown.mime, fileName: null });
  if (r.messageId) {
    await query('insert into lp_crm_media (message_id, mime, data) values ($1, $2, $3) on conflict (message_id) do nothing', [
      r.messageId,
      shown.mime,
      shown.data,
    ]);
  }
  return r.conversationId;
}

/** GIF em MP4: com a Evolution ajustada vai como GIF de verdade (formato original); sem ela, como vídeo curto. */
async function sendGifVideo(user: AuthUser, target: SendTarget, mp4: Buffer) {
  return sendMediaMessage(user, target, {
    kind: 'gif',
    mime: 'video/mp4',
    data: mp4.toString('base64'),
    file_name: 'gif.mp4',
    gifPlayback: await gifPlaybackOn(user.organizationId),
  });
}

const TargetSchema = {
  conversation_id: uuidParam.optional(),
  contact_id: uuidParam.optional(),
  company_id: uuidParam.optional(),
  phone: z.string().trim().max(30).optional(),
};

/**
 * Envia o GIF escolhido na galeria. Com a Evolution ajustada (gifPlayback): o MP4 do GIPHY, como GIF de verdade,
 * no formato original. Sem ela: figurinha animada (a Evolution 2.3 não marca vídeo como GIF e o WhatsApp
 * descarta GIF mandado como imagem).
 */
crmRouter.post('/messages/gif', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(z.object({ ...TargetSchema, gif_id: z.string().regex(/^[A-Za-z0-9]{4,40}$/, 'GIF inválido.') }), req.body);
  const g = (await giphy(`/${b.gif_id}`, {})).data;
  if (await gifPlaybackOn(user.organizationId)) {
    const mp4s = [g?.images?.original, g?.images?.downsized_small, g?.images?.fixed_height, g?.images?.fixed_width]
      .filter((x) => x?.mp4 && GIPHY_MEDIA.test(x.mp4) && (!x.mp4_size || Number(x.mp4_size) <= GIF_MAX_BYTES))
      .map((x) => String(x.mp4));
    for (const u of mp4s.slice(0, 2)) {
      const mp4 = await downloadGif(u);
      if (mp4) return res.status(201).json({ conversation_id: await sendGifVideo(user, b, mp4) });
    }
    throw new AppError(502, 'Não foi possível baixar este GIF. Escolha outro.', 'GIF_ERROR');
  }
  // Figurinha: 200px de largura com todos os quadros; se não couber em 500 KB, a versão com menos quadros
  const urls = [g?.images?.fixed_width, g?.images?.fixed_width_downsampled, g?.images?.fixed_height, g?.images?.fixed_height_downsampled]
    .filter((x) => x?.url && GIPHY_MEDIA.test(x.url) && /\.gif(\?|$)/i.test(x.url) && (!x.size || Number(x.size) <= GIF_MAX_BYTES))
    .map((x) => String(x.url));
  if (!urls.length) throw badRequest('Este GIF é grande demais para enviar. Escolha outro.');
  for (const [i, u] of urls.slice(0, 2).entries()) {
    const gif = await downloadGif(u);
    if (!gif) continue;
    // A 1ª versão grande demais para figurinha: tenta a com menos quadros antes de desistir da conversão
    if (i === 0 && urls[1] && gif.length > 900 * 1024) continue;
    return res.status(201).json({ conversation_id: await sendAsSticker(user, b, gif, 'image/gif', u) });
  }
  throw new AppError(502, 'Não foi possível baixar este GIF. Escolha outro.', 'GIF_ERROR');
});

// ─── GIFs salvos (cada usuário tem a sua lista) ─────────────────────

const SAVED_GIF_MIMES = /^(video\/mp4|image\/gif|image\/webp)$/i;

// Salva o GIF de uma mensagem (recebida ou enviada) na lista do próprio usuário
crmRouter.post('/saved-gifs', async (req, res) => {
  const user = authUser(req);
  const { message_id } = parseBody(z.object({ message_id: uuidParam }), req.body);
  const msg = await one<{
    id: string;
    conversation_id: string;
    type: string;
    wa_message_id: string | null;
    media_mime: string | null;
    file_name: string | null;
  }>('select id, conversation_id, type, wa_message_id, media_mime, file_name from lp_crm_messages where id = $1', [message_id]);
  if (!msg || !['gif', 'sticker', 'image'].includes(msg.type)) throw notFound('GIF não encontrado.');
  await ensureConversation(user, msg.conversation_id);
  const media = await loadMedia(user.organizationId, msg);
  if (!media || 'tooBig' in media) throw badRequest('Não foi possível obter este GIF (ele pode não estar mais disponível no WhatsApp).');
  const mime = media.mime.split(';')[0].trim().toLowerCase();
  if (!SAVED_GIF_MIMES.test(mime) || (msg.type === 'image' && mime !== 'image/gif')) throw badRequest('Esta mensagem não é um GIF.');
  if (media.data.length > GIF_MAX_BYTES) throw badRequest('GIF grande demais para salvar (até 3 MB).');
  const hash = createHash('sha256').update(media.data).digest('hex');
  const row = await one<{ id: string }>(
    `insert into lp_crm_saved_gifs (organization_id, user_id, mime, data, data_hash) values ($1, $2, $3, $4, $5)
     on conflict (user_id, data_hash) do update set created_at = now() returning id`,
    [user.organizationId, user.id, mime, media.data, hash],
  );
  res.status(201).json({ id: row!.id, mime });
});

crmRouter.get('/saved-gifs', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query('select id, mime, created_at from lp_crm_saved_gifs where user_id = $1 order by created_at desc limit 200', [user.id]);
  res.json(rows);
});

crmRouter.get('/saved-gifs/:id/file', async (req, res) => {
  const user = authUser(req);
  const row = await one<{ mime: string; data: Buffer }>('select mime, data from lp_crm_saved_gifs where id = $1 and user_id = $2', [
    uuidParam.parse(req.params.id),
    user.id,
  ]);
  if (!row) throw notFound('GIF não encontrado.');
  res.set({
    'Content-Type': row.mime,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.send(row.data);
});

crmRouter.delete('/saved-gifs/:id', async (req, res) => {
  const user = authUser(req);
  const r = await query('delete from lp_crm_saved_gifs where id = $1 and user_id = $2', [uuidParam.parse(req.params.id), user.id]);
  if (!r.rowCount) throw notFound('GIF não encontrado.');
  res.json({ ok: true });
});

// Envia um GIF salvo: MP4 como GIF (de verdade com a Evolution ajustada); GIF/WebP como figurinha
crmRouter.post('/messages/saved-gif', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(z.object({ ...TargetSchema, saved_id: uuidParam }), req.body);
  const row = await one<{ mime: string; data: Buffer }>('select mime, data from lp_crm_saved_gifs where id = $1 and user_id = $2', [b.saved_id, user.id]);
  if (!row) throw notFound('GIF não encontrado.');
  const conversationId = row.mime === 'video/mp4' ? await sendGifVideo(user, b, row.data) : await sendAsSticker(user, b, row.data, row.mime);
  res.status(201).json({ conversation_id: conversationId });
});

/** Tipos que podem abrir direto no navegador (não executam script). */
const SAFE_INLINE_MIME = /^(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/(mp4|webm|ogg|quicktime))$/i;

// Arquivo da mídia de uma mensagem (só para quem acessa a conversa)
crmRouter.get('/media/:id', async (req, res) => {
  const user = authUser(req);
  const msg = await one<{
    id: string;
    conversation_id: string;
    type: string;
    wa_message_id: string | null;
    media_mime: string | null;
    file_name: string | null;
  }>('select id, conversation_id, type, wa_message_id, media_mime, file_name from lp_crm_messages where id = $1', [uuidParam.parse(req.params.id)]);
  if (!msg || !MEDIA_TYPES.has(msg.type)) throw notFound('Arquivo não encontrado.');
  await ensureConversation(user, msg.conversation_id);
  const media = await loadMedia(user.organizationId, msg);
  if (!media) throw notFound('O arquivo não está mais disponível no WhatsApp.');
  if ('tooBig' in media) throw new AppError(413, 'Arquivo grande demais para abrir no CRM. Veja no celular.', 'CRM_MEDIA_TOO_BIG');
  // O tipo do arquivo vem de quem mandou a mensagem: só foto, áudio e vídeo comuns abrem na página.
  // Qualquer outro (HTML, SVG, PDF…) baixa como anexo, e a resposta não executa script (sandbox),
  // senão um arquivo mandado pelo WhatsApp poderia rodar código no painel
  const inline = msg.type !== 'document' && SAFE_INLINE_MIME.test(media.mime);
  res.set({
    'Content-Type': inline ? media.mime : 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': inline ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(msg.file_name || 'arquivo')}`,
  });
  res.send(media.data);
});

// ─── WhatsApp: conexão (somente gerência) ───────────────────────────

const wa = Router();
crmRouter.use('/whatsapp', requireRole(...MANAGER_ROLES), wa);

async function connectionState(orgId: string) {
  const cfg = await loadConfig(orgId);
  if (!cfg) return { cfg, state: 'not_configured' };
  try {
    const r = await evolution(cfg, 'GET', `/instance/connectionState/${cfg.instance}`);
    return { cfg, state: (r?.instance?.state ?? r?.state ?? 'unknown') as string };
  } catch (err) {
    if ((err as { evolutionStatus?: number }).evolutionStatus === 404) return { cfg, state: 'missing' };
    if (err instanceof AppError) return { cfg, state: 'error', error: err.message };
    throw err;
  }
}

wa.get('/', async (req, res) => {
  const user = authUser(req);
  const { cfg, state, error } = await connectionState(user.organizationId);
  res.json({
    configured: !!cfg,
    api_url: cfg?.apiUrl ?? null,
    instance: cfg?.instance ?? null,
    state,
    error: error ?? null,
    gif_playback: await gifPlaybackOn(user.organizationId),
  });
});

// A Evolution foi ajustada para GIF de verdade (deploy/evolution-gif)? Ligado: GIFs vão como GIF, formato original
wa.put('/gif-playback', async (req, res) => {
  const user = authUser(req);
  const { enabled } = parseBody(z.object({ enabled: z.boolean() }), req.body);
  const r = await query('update lp_crm_whatsapp set gif_playback = $2 where organization_id = $1', [user.organizationId, enabled]);
  if (!r.rowCount) throw badRequest('Configure o servidor do WhatsApp primeiro.');
  res.json({ ok: true, gif_playback: enabled });
});

wa.put('/', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(
    z.object({
      api_url: z.string().trim().url('Informe a URL da Evolution API (https://…).').max(300),
      api_key: z.string().trim().max(300).optional(),
      instance: z
        .string()
        .trim()
        .regex(/^[\w-]{2,60}$/, 'Nome da instância: letras, números, - ou _.'),
    }),
    req.body,
  );
  const url = new URL(b.api_url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(400, 'A URL da Evolution API deve começar com https://.', 'BAD_REQUEST');
  // Em produção, endereço interno (localhost, rede privada, metadata da nuvem) é recusado já ao salvar
  if (env.isProduction) await assertPublicHost(url);
  await saveConfig(user.organizationId, b.api_url, b.api_key || null, b.instance);
  res.json({ ok: true });
});

const WEBHOOK_EVENTS = CRM_WEBHOOK_EVENTS;

wa.post('/connect', async (req, res) => {
  const user = authUser(req);
  const { cfg, state } = await connectionState(user.organizationId);
  if (state === 'missing') {
    await evolution(cfg, 'POST', '/instance/create', {
      instanceName: cfg!.instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: false,
      groupsIgnore: true,
      syncFullHistory: true,
    });
  }
  // Rodando no computador com a Evolution na internet: não grava o endereço local (ela não o alcança e o
  // sistema publicado, que usa a mesma instância, deixaria de receber os avisos)
  if (canSetWebhook(cfg!)) {
    await evolution(cfg, 'POST', `/webhook/set/${cfg!.instance}`, {
      webhook: { enabled: true, url: webhookUrl(user.organizationId), byEvents: false, base64: false, events: WEBHOOK_EVENTS },
    });
  } else {
    console.warn('[crm] webhook não gravado: o sistema está em endereço local e a Evolution, na internet');
  }
  if (state === 'open') return res.json({ state, qrcode: null });
  // Ao ler o QR o celular manda o histórico das conversas (depois trazido por "Importar conversas")
  const settings = await evolution<Record<string, unknown>>(cfg, 'GET', `/settings/find/${cfg!.instance}`).catch(() => null);
  if (settings && settings.syncFullHistory !== true) {
    await evolution(cfg, 'POST', `/settings/set/${cfg!.instance}`, { ...settings, syncFullHistory: true }).catch((err) =>
      console.error('[crm] syncFullHistory', err),
    );
  }
  const r = await evolution(cfg, 'GET', `/instance/connect/${cfg!.instance}`);
  res.json({ state: (await connectionState(user.organizationId)).state, qrcode: r?.base64 ?? null, pairing_code: r?.pairingCode ?? null });
});

// Importa (em lotes) as conversas que a Evolution já guardou; a tela chama de novo com `offset` até acabar
wa.post('/import', async (req, res) => {
  const user = authUser(req);
  const { offset } = parseBody(z.object({ offset: z.number().int().min(0).default(0) }), req.body);
  res.json(await importHistory(user.organizationId, offset));
});

/**
 * Desconectar. A Evolution às vezes responde 500 "Connection Closed" ao logout com o estado ainda "open"
 * (a ligação interna caiu, mas o estado não foi atualizado): aí reinicia a instância e tenta de novo; se
 * continuar conectada, apaga a instância (a sessão do WhatsApp acaba; "Conectar" cria outra e gera o QR).
 */
wa.post('/logout', async (req, res) => {
  const user = authUser(req);
  const cfg = await loadConfig(user.organizationId);
  if (!cfg) throw badRequest('O WhatsApp não está configurado.');
  const path = (action: string) => `/instance/${action}/${cfg.instance}`;
  const logout = () =>
    evolution(cfg, 'DELETE', path('logout')).then(
      () => true,
      (err) => (console.error('[crm] logout', err), false),
    );
  if (await logout()) return res.json({ ok: true, method: 'logout' });
  // Reinicia (PUT nas versões novas da Evolution, POST nas antigas) e tenta sair de novo
  await evolution(cfg, 'PUT', path('restart')).catch(() => evolution(cfg, 'POST', path('restart')).catch(() => null));
  if (await logout()) return res.json({ ok: true, method: 'restart' });
  const { state } = await connectionState(user.organizationId);
  if (state !== 'open') return res.json({ ok: true, method: 'closed', state });
  // Último recurso: apaga a instância, o que encerra a sessão no celular também
  try {
    await evolution(cfg, 'DELETE', path('delete'));
  } catch (err) {
    const why = (err as { evolutionMessage?: string }).evolutionMessage;
    throw new AppError(502, `O servidor do WhatsApp não desconectou${why ? ` (${why.slice(0, 160)})` : ''}. Tente de novo em alguns segundos.`, 'CRM_WA_ERROR');
  }
  res.json({ ok: true, method: 'delete' });
});
