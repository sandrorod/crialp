-- ════════════════════════════════════════════════════════════════
-- Limite de tentativas (login, uploads, IA…) compartilhado entre as instâncias da Vercel.
-- Em memória, cada instância contava separado e o limite real se multiplicava.
-- RLS ativa sem políticas: fora da Data API pública do Supabase (chave anon).
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_rate_limits (
  key       text primary key,
  hits      integer not null,
  reset_at  timestamptz not null
);
create index if not exists lp_rate_limits_reset_idx on lp_rate_limits (reset_at);

alter table lp_rate_limits enable row level security;
