-- ════════════════════════════════════════════════════════════════
-- Valor cobrado dos clientes de cada nível (em reais; opcional)
-- ════════════════════════════════════════════════════════════════

alter table lp_client_levels add column if not exists price numeric(12,2) check (price is null or price >= 0);
