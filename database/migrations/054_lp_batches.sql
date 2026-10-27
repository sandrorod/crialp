-- ════════════════════════════════════════════════════════════════
-- Lote de LPs no servidor: as empresas selecionadas em "Buscar empresas" são analisadas e geradas
-- uma de cada vez pelo próprio servidor, sem depender da aba do navegador ficar em primeiro plano.
--   stage: 'wait' (esperando o intervalo para começar a empresa idx) · 'analyze' · 'generate'
--   status: 'running' · 'paused' (não começa a próxima) · 'canceled' · 'done'
--   results: um item por empresa já processada ({ status: ok|error|skipped, error?, companyId?, landingPageId? })
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  items            jsonb not null,
  fotos            boolean not null default false,
  gap_minutes      integer not null default 3,
  status           text not null default 'running' check (status in ('running', 'paused', 'canceled', 'done')),
  stage            text not null default 'wait' check (stage in ('wait', 'analyze', 'generate')),
  idx              integer not null default 0,
  ok               integer not null default 0,
  results          jsonb not null default '[]'::jsonb,
  job_id           uuid,
  company_id       uuid,
  next_at          timestamptz not null default now(),
  paused_left      integer,
  wake_at          timestamptz,
  lease_until      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lp_batches_org_idx on lp_batches (organization_id, created_at desc);

alter table lp_batches enable row level security;
