-- ════════════════════════════════════════════════════════════════
-- Andamento da edição de cada Landing Page: "editar" (padrão) ou "pronta"
-- Independente de ativa/inativa; as páginas existentes começam como "editar".
-- ════════════════════════════════════════════════════════════════

alter table landing_pages add column if not exists edit_status text not null default 'editar';
alter table landing_pages drop constraint if exists landing_pages_edit_status_chk;
alter table landing_pages add constraint landing_pages_edit_status_chk check (edit_status in ('editar', 'pronta'));
create index if not exists landing_pages_edit_status_idx on landing_pages (organization_id, edit_status);
