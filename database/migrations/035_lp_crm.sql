-- ════════════════════════════════════════════════════════════════
-- CRM: contatos, funil, tarefas e WhatsApp (número central via Evolution API)
-- Usa as empresas já cadastradas (companies). O vendedor enxerga a empresa
-- quando a Landing Page dela está atribuída a ele (mesma regra da área de Vendas).
-- ════════════════════════════════════════════════════════════════

-- Chave de comparação de telefone: o WhatsApp às vezes omite o 9º dígito
-- (55 11 8888-7777 em vez de 55 11 98888-7777), então compara 55 + DDD + 8 últimos dígitos.
-- Números com 10/11 dígitos sem DDI são tratados como brasileiros.
create or replace function lp_crm_wa_key(p text) returns text
language sql immutable as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n),
       n as (select case when length(n) in (10, 11) then '55' || n else n end as n from d)
  select case
    when n = '' then null
    when n like '55%' and length(n) in (12, 13) then '55' || substr(n, 3, 2) || right(n, 8)
    else n
  end from n;
$$;

create table if not exists lp_crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  name             text not null,
  job_title        text,
  email            text,
  phone            text,
  whatsapp         text,
  wa_key           text generated always as (lp_crm_wa_key(whatsapp)) stored,
  notes            text,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lp_crm_contacts_company_idx on lp_crm_contacts (company_id);
-- Um WhatsApp pertence a um único contato, senão não dá para saber de quem é a conversa
create unique index if not exists lp_crm_contacts_wa_uniq on lp_crm_contacts (organization_id, wa_key) where wa_key is not null;

create table if not exists lp_crm_stages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  position         int not null,
  color            text not null default '#71717a',
  kind             text not null default 'open' check (kind in ('open', 'won', 'lost'))
);
create index if not exists lp_crm_stages_org_idx on lp_crm_stages (organization_id, position);

-- Etapas padrão para as organizações existentes (as novas recebem na primeira abertura do funil)
insert into lp_crm_stages (organization_id, name, position, color, kind)
select o.id, s.name, s.position, s.color, s.kind
  from organizations o
 cross join (values
   ('Prospecção', 1, '#71717a', 'open'),
   ('Qualificação', 2, '#0ea5e9', 'open'),
   ('Proposta', 3, '#8b5cf6', 'open'),
   ('Negociação', 4, '#f59e0b', 'open'),
   ('Ganho', 5, '#16a34a', 'won'),
   ('Perdido', 6, '#dc2626', 'lost')
 ) as s(name, position, color, kind)
 where not exists (select 1 from lp_crm_stages x where x.organization_id = o.id);

create table if not exists lp_crm_deals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  contact_id       uuid references lp_crm_contacts(id) on delete set null,
  stage_id         uuid not null references lp_crm_stages(id),
  title            text not null,
  value            numeric(14, 2) not null default 0,
  expected_close   date,
  notes            text,
  position         double precision not null default 0,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lp_crm_deals_company_idx on lp_crm_deals (company_id);
create index if not exists lp_crm_deals_stage_idx on lp_crm_deals (stage_id, position);

create table if not exists lp_crm_tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  title            text not null,
  description      text,
  due_at           timestamptz,
  done             boolean not null default false,
  done_at          timestamptz,
  company_id       uuid references companies(id) on delete cascade,
  contact_id       uuid references lp_crm_contacts(id) on delete set null,
  deal_id          uuid references lp_crm_deals(id) on delete set null,
  assignee_id      uuid not null references users(id) on delete cascade,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lp_crm_tasks_assignee_idx on lp_crm_tasks (assignee_id, done, due_at);
create index if not exists lp_crm_tasks_company_idx on lp_crm_tasks (company_id);

-- Conversas do número central. company_id/contact_id são resolvidos pelo telefone
-- (contato do CRM ou WhatsApp/celular da própria empresa); sem empresa, só a gerência vê.
create table if not exists lp_crm_conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  phone            text not null,
  wa_key           text generated always as (lp_crm_wa_key(phone)) stored,
  remote_jid       text,
  push_name        text,
  contact_id       uuid references lp_crm_contacts(id) on delete set null,
  company_id       uuid references companies(id) on delete set null,
  last_message     text,
  last_message_at  timestamptz,
  unread           int not null default 0,
  created_at       timestamptz not null default now()
);
create unique index if not exists lp_crm_conversations_wa_uniq on lp_crm_conversations (organization_id, wa_key);
create index if not exists lp_crm_conversations_company_idx on lp_crm_conversations (company_id);
create index if not exists lp_crm_conversations_last_idx on lp_crm_conversations (organization_id, last_message_at desc nulls last);

create table if not exists lp_crm_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references lp_crm_conversations(id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  type             text not null default 'text',
  body             text,
  wa_message_id    text,
  status           text not null default 'sent',
  sent_by          uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index if not exists lp_crm_messages_wa_uniq on lp_crm_messages (wa_message_id);
create index if not exists lp_crm_messages_conv_idx on lp_crm_messages (conversation_id, created_at desc);

-- Conexão com a Evolution API por organização (chave criptografada pela API)
create table if not exists lp_crm_whatsapp (
  organization_id  uuid primary key references organizations(id) on delete cascade,
  api_url          text not null,
  api_key_encrypted text not null,
  instance         text not null,
  updated_at       timestamptz not null default now()
);

-- Acesso só pela API do sistema (bloqueia a API pública do Supabase, como nas demais tabelas)
alter table lp_crm_contacts enable row level security;
alter table lp_crm_stages enable row level security;
alter table lp_crm_deals enable row level security;
alter table lp_crm_tasks enable row level security;
alter table lp_crm_conversations enable row level security;
alter table lp_crm_messages enable row level security;
alter table lp_crm_whatsapp enable row level security;
