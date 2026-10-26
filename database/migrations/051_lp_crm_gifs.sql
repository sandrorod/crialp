-- ════════════════════════════════════════════════════════════════
-- GIFs do WhatsApp do CRM
-- 1) gif_playback: a Evolution da organização aceita gifPlayback (versão ajustada, ver deploy/evolution-gif):
--    com ela, GIF vai como GIF de verdade (MP4 marcado como GIF, formato original); sem ela, como figurinha.
-- 2) GIFs salvos: cada usuário (e subusuário) tem a sua lista, para reenviar GIFs recebidos ou enviados.
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_whatsapp add column if not exists gif_playback boolean not null default false;

create table if not exists lp_crm_saved_gifs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  mime             text not null,
  data             bytea not null,
  data_hash        text not null,
  created_at       timestamptz not null default now(),
  unique (user_id, data_hash)
);
create index if not exists lp_crm_saved_gifs_user_idx on lp_crm_saved_gifs (user_id, created_at desc);

alter table lp_crm_saved_gifs enable row level security;
