-- ════════════════════════════════════════════════════════════════
-- Imagens enviadas pelo painel (logotipo, fotos) quando não há Blob Store:
-- no Vercel o disco é somente leitura, então o arquivo fica no banco (servido em /uploads/db/<id>.<ext>)
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_uploads (
  id            uuid primary key default gen_random_uuid(),
  content_type  text not null,
  data          bytea not null,
  size          int not null,
  created_at    timestamptz not null default now()
);

alter table lp_uploads enable row level security;
