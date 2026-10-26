-- ════════════════════════════════════════════════════════════════
-- Figurinhas animadas do CRM (GIFs convertidos em WebP 512×512) servidas por um link temporário:
-- a Evolution só trata como animada a figurinha baixada de um link ".gif". Apagadas depois de 1 dia.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_sticker_files (
  id          uuid primary key default gen_random_uuid(),
  data        bytea not null,
  created_at  timestamptz not null default now()
);

alter table lp_crm_sticker_files enable row level security;
