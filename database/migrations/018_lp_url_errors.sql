-- ════════════════════════════════════════════════════════════════
-- Link cuja análise (leitura dos dados para gerar a LP) falhou: a empresa ainda não foi cadastrada,
-- então o erro fica pelo link e aparece em "Buscar empresas" até uma análise do mesmo link dar certo.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_url_errors (
  organization_id uuid not null,
  url_key         text not null,
  url             text not null,
  error           text not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, url_key)
);

alter table lp_url_errors enable row level security;
