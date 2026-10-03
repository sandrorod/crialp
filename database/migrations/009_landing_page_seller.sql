-- ════════════════════════════════════════════════════════════════
-- Vendedor responsável por cada Landing Page (distribuição igual entre os vendedores)
-- ════════════════════════════════════════════════════════════════

-- Excluir o vendedor deixa a página sem responsável; a API redistribui em seguida
alter table landing_pages add column if not exists seller_id uuid references users(id) on delete set null;
create index if not exists landing_pages_seller_idx on landing_pages (seller_id) where seller_id is not null;

-- Páginas já existentes: rodízio entre os vendedores de cada organização, da mais antiga para a mais nova
with s as (
  select id, organization_id,
         row_number() over (partition by organization_id order by created_at, id) - 1 as n,
         count(*) over (partition by organization_id) as total
    from users where role = 'seller'
), p as (
  select id, organization_id, row_number() over (partition by organization_id order by created_at, id) - 1 as n
    from landing_pages where seller_id is null
)
update landing_pages lp set seller_id = s.id
  from p join s on s.organization_id = p.organization_id and s.n = p.n % s.total
 where lp.id = p.id;
