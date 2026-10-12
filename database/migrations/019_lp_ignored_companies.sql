-- ════════════════════════════════════════════════════════════════
-- Empresas ignoradas em "Buscar empresas": não aparecem mais nos resultados (nem em novas pesquisas).
-- Cada empresa guarda as chaves que a identificam (código do local no Google, link, domínio próprio).
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_ignored_companies (
  organization_id uuid not null,
  key             text not null,
  name            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  primary key (organization_id, key)
);

alter table lp_ignored_companies enable row level security;
