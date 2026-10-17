-- ════════════════════════════════════════════════════════════════
-- Níveis de cliente (menu "Nível cliente"): cadastrados pelo administrador e
-- escolhidos na geração da Landing Page (junto com o vendedor)
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_client_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lp_client_levels_name_idx on lp_client_levels (organization_id, lower(name));

-- Excluir o nível deixa as páginas sem nível
alter table landing_pages add column if not exists client_level_id uuid references lp_client_levels(id) on delete set null;
