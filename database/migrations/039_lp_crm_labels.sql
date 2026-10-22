-- ════════════════════════════════════════════════════════════════
-- CRM: etiquetas das conversas do WhatsApp (como no WhatsApp Business)
-- As etiquetas são da organização; uma conversa pode ter várias.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_labels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  color            text not null default '#2553e0',
  created_at       timestamptz not null default now()
);
create unique index if not exists lp_crm_labels_name_uniq on lp_crm_labels (organization_id, lower(name));

create table if not exists lp_crm_conversation_labels (
  conversation_id  uuid not null references lp_crm_conversations(id) on delete cascade,
  label_id         uuid not null references lp_crm_labels(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (conversation_id, label_id)
);
create index if not exists lp_crm_conversation_labels_label_idx on lp_crm_conversation_labels (label_id);

alter table lp_crm_labels enable row level security;
alter table lp_crm_conversation_labels enable row level security;
