-- ════════════════════════════════════════════════════════════════
-- Imagem (JPG) da Landing Page inteira, gerada junto com a página
-- Fica no banco: no Vercel o disco é somente leitura e não há Blob configurado
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_screenshots (
  landing_page_id  uuid primary key references landing_pages(id) on delete cascade,
  -- null quando a última tentativa falhou (ver error)
  image            bytea,
  width            int,
  height           int,
  error            text,
  created_at       timestamptz not null default now()
);

alter table lp_screenshots enable row level security;
