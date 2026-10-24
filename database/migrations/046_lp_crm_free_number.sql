-- ════════════════════════════════════════════════════════════════
-- CRM: quem pode iniciar conversa com número fora do cadastro
-- Sem linha = padrão do papel (dono e admin podem, vendedor não). O dono sempre pode.
-- A conversa iniciada assim nasce sem empresa: started_by deixa o vendedor que a iniciou enxergá-la.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_free_number_users (
  user_id          uuid primary key references users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  allowed          boolean not null,
  updated_by       uuid references users(id) on delete set null,
  updated_at       timestamptz not null default now()
);

alter table lp_crm_free_number_users enable row level security;

alter table lp_crm_conversations add column if not exists started_by uuid references users(id) on delete set null;
