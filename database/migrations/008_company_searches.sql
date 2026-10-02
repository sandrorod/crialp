-- ════════════════════════════════════════════════════════════════
-- Histórico de pesquisas de "Buscar empresas" (resultados salvos)
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_company_searches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid references users(id) on delete set null,
  query            text not null,
  -- centro da busca (lat/lng) para continuar em "Buscar mais locais"
  center           jsonb,
  page             int not null default 0,
  has_more         boolean not null default false,
  -- locais encontrados (sem a marcação de "já cadastrada", calculada ao exibir)
  results          jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists lp_company_searches_org_idx on lp_company_searches (organization_id, updated_at desc);

alter table lp_company_searches enable row level security;
