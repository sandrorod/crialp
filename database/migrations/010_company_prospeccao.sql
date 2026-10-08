-- ════════════════════════════════════════════════════════════════
-- Marca se a empresa está em prospecção (sim = true / não = false)
-- ════════════════════════════════════════════════════════════════

-- Empresas já existentes ficam como "não"
alter table companies add column if not exists prospeccao boolean not null default false;
