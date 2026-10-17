-- ════════════════════════════════════════════════════════════════
-- wp_verificado e wp_testado ficam na tabela companies (texto, opcional),
-- e não em landing_pages (onde foram criados por engano nas migrations 026/027)
-- ════════════════════════════════════════════════════════════════

alter table landing_pages drop column if exists wp_verificado;
alter table landing_pages drop column if exists wp_testado;

alter table companies add column if not exists wp_verificado text;
alter table companies add column if not exists wp_testado text;
