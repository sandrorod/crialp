-- ════════════════════════════════════════════════════════════════
-- Acesso do cliente: conta que entra no painel e só edita o próprio site
-- ════════════════════════════════════════════════════════════════

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner', 'admin', 'editor', 'seller', 'client'));

-- Landing Page que a conta de cliente pode editar (excluir a página exclui o acesso)
alter table users add column if not exists landing_page_id uuid references landing_pages(id) on delete cascade;
create index if not exists users_landing_page_idx on users (landing_page_id) where landing_page_id is not null;
