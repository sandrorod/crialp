-- ════════════════════════════════════════════════════════════════
-- CRM: mídias do WhatsApp (imagem, GIF, vídeo, áudio, figurinha, documento)
-- O arquivo recebido é baixado da Evolution na primeira vez que alguém abre a mensagem
-- e fica guardado aqui; o enviado pelo CRM é guardado no envio.
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_messages add column if not exists media_mime text;
alter table lp_crm_messages add column if not exists file_name text;

create table if not exists lp_crm_media (
  message_id  uuid primary key references lp_crm_messages(id) on delete cascade,
  mime        text not null,
  data        bytea not null,
  created_at  timestamptz not null default now()
);

alter table lp_crm_media enable row level security;
