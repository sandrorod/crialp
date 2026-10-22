-- ════════════════════════════════════════════════════════════════
-- Avaliações do Google da empresa (as 5 melhores com nota máxima), buscadas ao gerar a LP.
-- null = ainda não buscadas; { items: [] } = buscadas, sem avaliação 5 estrelas com texto.
-- ════════════════════════════════════════════════════════════════

alter table companies add column if not exists google_reviews jsonb;
