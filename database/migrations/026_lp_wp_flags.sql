-- ════════════════════════════════════════════════════════════════
-- Marcações por Landing Page: wp_verificado e wp_testado
-- ════════════════════════════════════════════════════════════════

alter table landing_pages add column if not exists wp_verificado boolean not null default false;
alter table landing_pages add column if not exists wp_testado boolean not null default false;
