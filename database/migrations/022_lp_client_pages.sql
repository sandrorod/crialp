-- ════════════════════════════════════════════════════════════════
-- Acesso do cliente a vários sites: o mesmo e-mail (uma conta de cliente) pode editar
-- mais de uma Landing Page; ao entrar, escolhe qual site editar
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_client_pages (
  user_id uuid not null references users(id) on delete cascade,
  landing_page_id uuid not null references landing_pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, landing_page_id)
);
create index if not exists lp_client_pages_lp_idx on lp_client_pages (landing_page_id);

insert into lp_client_pages (user_id, landing_page_id)
  select id, landing_page_id from users where role = 'client' and landing_page_id is not null
  on conflict do nothing;

-- users.landing_page_id deixa de ser usado: excluir uma das páginas não pode mais excluir a conta
update users set landing_page_id = null where role = 'client' and landing_page_id is not null;
