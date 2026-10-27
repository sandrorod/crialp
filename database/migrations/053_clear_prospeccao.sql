-- ════════════════════════════════════════════════════════════════
-- Limpa a prospecção de todas as empresas (pedido de 26/10/2026).
-- Antes, guarda os valores atuais em companies_prospeccao_backup_20261026 para poder desfazer:
--   update companies c set prospeccao = b.prospeccao from companies_prospeccao_backup_20261026 b where b.company_id = c.id;
-- ════════════════════════════════════════════════════════════════

create table if not exists companies_prospeccao_backup_20261026 (
  company_id uuid primary key,
  prospeccao text not null,
  saved_at timestamptz not null default now()
);
alter table companies_prospeccao_backup_20261026 enable row level security;

insert into companies_prospeccao_backup_20261026 (company_id, prospeccao)
select id, prospeccao from companies where prospeccao is not null
on conflict (company_id) do nothing;

update companies set prospeccao = null where prospeccao is not null;
