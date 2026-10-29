-- ════════════════════════════════════════════════════════════════
-- CRM: conversas fixadas no topo da lista do WhatsApp
-- Cada usuário fixa as suas (como no WhatsApp); quem fixou por último fica em cima.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_conversation_pins (
  user_id          uuid not null references users(id) on delete cascade,
  conversation_id  uuid not null references lp_crm_conversations(id) on delete cascade,
  pinned_at        timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
create index if not exists lp_crm_conversation_pins_conv_idx on lp_crm_conversation_pins (conversation_id);

alter table lp_crm_conversation_pins enable row level security;
