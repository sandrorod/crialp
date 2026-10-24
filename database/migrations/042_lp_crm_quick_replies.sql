-- ════════════════════════════════════════════════════════════════
-- CRM: mensagens prontas do WhatsApp (respostas rápidas)
-- No campo de mensagem, "/atalho" puxa o texto salvo. Atalho único por organização.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_quick_replies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  shortcut         text not null,
  body             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists lp_crm_quick_replies_shortcut_uniq on lp_crm_quick_replies (organization_id, lower(shortcut));

alter table lp_crm_quick_replies enable row level security;
