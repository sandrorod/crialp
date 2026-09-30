-- ════════════════════════════════════════════════════════════════
-- Configurações do sistema alteradas pelo painel (chave → valor)
-- Ex.: chave do Gemini da variável de ambiente removida do rodízio
-- ════════════════════════════════════════════════════════════════

create table app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;
