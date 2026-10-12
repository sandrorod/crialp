-- ════════════════════════════════════════════════════════════════
-- Erro na geração da Landing Page: a empresa fica marcada ("Erro ao gerar") até gerar com sucesso.
-- Fica na empresa (o histórico de processamentos é apagado em 7 dias).
-- ════════════════════════════════════════════════════════════════

alter table companies add column if not exists lp_error text;
alter table companies add column if not exists lp_error_at timestamptz;
