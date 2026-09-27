-- ════════════════════════════════════════════════════════════════
-- Conteúdo completo coletado do site da empresa
-- Guarda o texto integral de cada página lida e todos os dados encontrados
-- (telefones, e-mails, redes, CEPs, JSON-LD), mesmo o que a IA não estruturou,
-- para que o administrador tenha acesso a tudo e possa reaproveitar na LP.
-- ════════════════════════════════════════════════════════════════

create table company_sources (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  url          text not null,
  title        text,
  description  text,
  content      text not null default '',
  position     int not null default 0,
  fetched_at   timestamptz not null default now()
);
create index company_sources_company_idx on company_sources (company_id, position);

-- Contatos, redes, CEPs e dados estruturados encontrados no site (brutos)
alter table companies add column source_data jsonb not null default '{}'::jsonb;

alter table company_sources enable row level security;
