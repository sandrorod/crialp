import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { longText, parseBody, text, uuidParam } from '../lib/validation.js';
import { authUser, MANAGER_ROLES, requireRole, type AuthUser } from '../middleware/auth.js';
import {
  evolution,
  importHistory,
  jidNumber,
  loadConfig,
  normalizeNumber,
  registerMessage,
  relinkConversations,
  saveConfig,
  syncRecent,
  webhookUrl,
} from '../services/crm/whatsapp.js';

/**
 * CRM: empresas (as já cadastradas), contatos, funil, tarefas e WhatsApp.
 * Gerência (owner/admin) vê tudo; vendedor só as empresas cuja Landing Page está atribuída a ele.
 */
export const crmRouter = Router();

const isManager = (u: AuthUser) => MANAGER_ROLES.includes(u.role);
/** Id do vendedor para filtrar, ou null para a gerência (sem filtro). */
const sellerScope = (u: AuthUser) => (isManager(u) ? null : u.id);
/** Empresa `alias` visível ao vendedor do parâmetro `p` (null = todas). */
const visible = (alias: string, p: string) =>
  `(${p}::uuid is null or exists (select 1 from landing_pages lpv where lpv.company_id = ${alias} and lpv.seller_id = ${p}))`;

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
        and ($3::uuid is null or (cv.company_id is not null and ${visible('cv.company_id', '$3')}))`,
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
    await one(
      `select ct.*, coalesce(c.trade_name, c.name) as company_name from lp_crm_contacts ct join companies c on c.id = ct.company_id where ct.id = $1`,
      [contact.id],
    ),
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

crmRouter.get('/deals', async (req, res) => {
  const user = authUser(req);
  const f = z.object({ seller: z.string().max(40).optional() }).parse(req.query);
  const filterSeller = isManager(user) && f.seller && uuidParam.safeParse(f.seller).success ? f.seller : null;
  const { rows } = await query(
    `select d.*, coalesce(c.trade_name, c.name) as company_name, ct.name as contact_name
       from lp_crm_deals d
       join companies c on c.id = d.company_id
       left join lp_crm_contacts ct on ct.id = d.contact_id
      where d.organization_id = $1 and ${visible('c.id', '$2')} and ${visible('c.id', '$3')}
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
  expected_close: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('').transform(() => null)),
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
  const deal = await one<{ id: string; company_id: string }>('select id, company_id from lp_crm_deals where id = $1 and organization_id = $2', [id, user.organizationId]);
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
  due_at: z.string().datetime({ offset: true }).nullish().or(z.literal('').transform(() => null)),
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
  res.status(201).json(created);
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
  const f = z.object({ unlinked: z.enum(['true', 'false']).optional() }).parse(req.query);
  // Empresa cadastrada/alterada depois da 1ª mensagem: tenta ligar as conversas que ainda estão sem empresa
  if (isManager(user)) await relinkConversations(user.organizationId, { onlyUnlinked: true });
  const { rows } = await query(
    `select cv.id, cv.phone, cv.push_name, cv.contact_id, cv.company_id, cv.unread, cv.last_message, cv.last_message_at,
            ct.name as contact_name, coalesce(c.trade_name, c.name) as company_name
       from lp_crm_conversations cv
       left join lp_crm_contacts ct on ct.id = cv.contact_id
       left join companies c on c.id = cv.company_id
      where cv.organization_id = $1
        and ($2::uuid is null or (cv.company_id is not null and ${visible('cv.company_id', '$2')}))
        and (not $3 or cv.company_id is null)
      order by cv.last_message_at desc nulls last
      limit 300`,
    [user.organizationId, sellerScope(user), isManager(user) && f.unlinked === 'true'],
  );
  res.json(rows);
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
        and ($2::uuid is null or (cv.company_id is not null and ${visible('cv.company_id', '$2')}))`,
    [user.organizationId, sellerScope(user)],
  );
  res.json({ total: r?.total ?? 0 });
});

crmRouter.get('/conversations/:id/messages', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  const { rows } = await query(
    `select * from (
       select m.id, m.direction, m.type, m.body, m.status, m.created_at, u.name as sent_by_name,
              m.my_reaction, m.their_reaction, m.wa_message_id is not null as can_react
         from lp_crm_messages m left join users u on u.id = m.sent_by
        where m.conversation_id = $1 order by m.created_at desc limit 200
     ) x order by created_at`,
    [conv.id],
  );
  res.json(rows);
});

crmRouter.post('/conversations/:id/read', async (req, res) => {
  const user = authUser(req);
  const conv = await ensureConversation(user, uuidParam.parse(req.params.id));
  await query('update lp_crm_conversations set unread = 0 where id = $1', [conv.id]);
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
  text: z.string().trim().min(1, 'Mensagem vazia.').max(4000),
});

crmRouter.post('/messages', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(SendSchema, req.body);
  let number: string;
  // Enviando pelo WhatsApp da empresa: a conversa fica com ela (o número pode estar em mais de uma empresa)
  let companyTarget: string | null = null;
  if (b.conversation_id) {
    const conv = await ensureConversation(user, b.conversation_id);
    number = conv.remote_jid ? jidNumber(conv.remote_jid) : normalizeNumber(conv.phone);
  } else if (b.contact_id) {
    const ct = await ensureContact(user, b.contact_id);
    if (!ct.whatsapp) throw badRequest('Este contato não tem WhatsApp cadastrado.');
    number = normalizeNumber(ct.whatsapp);
  } else if (b.company_id) {
    const co = await ensureCompany(user, b.company_id);
    const n = co.whatsapp || co.mobile;
    if (!n) throw badRequest('Esta empresa não tem WhatsApp cadastrado.');
    number = normalizeNumber(n);
    companyTarget = co.id;
  } else {
    throw badRequest('Informe a conversa, o contato ou a empresa.');
  }

  const cfg = await loadConfig(user.organizationId);
  let sent: any;
  try {
    sent = await evolution(cfg, 'POST', `/message/sendText/${cfg?.instance}`, { number, text: b.text });
  } catch (err) {
    const status = (err as { evolutionStatus?: number }).evolutionStatus;
    if (status === 400 && /exists|not.*whatsapp/i.test((err as { evolutionMessage?: string }).evolutionMessage ?? '')) {
      throw badRequest('Este número não tem WhatsApp.');
    }
    throw err;
  }
  const jid: string = sent?.key?.remoteJid ?? `${number}@s.whatsapp.net`;
  const { conversationId } = await registerMessage({
    orgId: user.organizationId,
    phone: jidNumber(jid),
    remoteJid: jid,
    pushName: null,
    direction: 'out',
    type: 'text',
    body: b.text,
    waMessageId: sent?.key?.id ?? null,
    sentBy: user.id,
  });
  if (companyTarget) {
    await query('update lp_crm_conversations set company_id = $2 where id = $1 and contact_id is null', [conversationId, companyTarget]);
  }
  res.status(201).json({ conversation_id: conversationId });
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
  res.json({ configured: !!cfg, api_url: cfg?.apiUrl ?? null, instance: cfg?.instance ?? null, state, error: error ?? null });
});

wa.put('/', async (req, res) => {
  const user = authUser(req);
  const b = parseBody(
    z.object({
      api_url: z.string().trim().url('Informe a URL da Evolution API (https://…).').max(300),
      api_key: z.string().trim().max(300).optional(),
      instance: z.string().trim().regex(/^[\w-]{2,60}$/, 'Nome da instância: letras, números, - ou _.'),
    }),
    req.body,
  );
  await saveConfig(user.organizationId, b.api_url, b.api_key || null, b.instance);
  res.json({ ok: true });
});

const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];

wa.post('/connect', async (req, res) => {
  const user = authUser(req);
  const { cfg, state } = await connectionState(user.organizationId);
  if (state === 'missing') {
    await evolution(cfg, 'POST', '/instance/create', { instanceName: cfg!.instance, integration: 'WHATSAPP-BAILEYS', qrcode: false, groupsIgnore: true, syncFullHistory: true });
  }
  await evolution(cfg, 'POST', `/webhook/set/${cfg!.instance}`, {
    webhook: { enabled: true, url: webhookUrl(user.organizationId), byEvents: false, base64: false, events: WEBHOOK_EVENTS },
  });
  if (state === 'open') return res.json({ state, qrcode: null });
  // Ao ler o QR o celular manda o histórico das conversas (depois trazido por "Importar conversas")
  const settings = await evolution<Record<string, unknown>>(cfg, 'GET', `/settings/find/${cfg!.instance}`).catch(() => null);
  if (settings && settings.syncFullHistory !== true) {
    await evolution(cfg, 'POST', `/settings/set/${cfg!.instance}`, { ...settings, syncFullHistory: true }).catch((err) => console.error('[crm] syncFullHistory', err));
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

wa.post('/logout', async (req, res) => {
  const user = authUser(req);
  const cfg = await loadConfig(user.organizationId);
  await evolution(cfg, 'DELETE', `/instance/logout/${cfg?.instance}`);
  res.json({ ok: true });
});
