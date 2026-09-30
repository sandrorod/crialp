-- ════════════════════════════════════════════════════════════════
-- Configurações do sistema alteradas pelo painel (chave → valor)
-- Ex.: chave do Gemini da variável de ambiente removida do rodízio
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table lp_settings enable row level security;
