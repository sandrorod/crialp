-- ════════════════════════════════════════════════════════════════
-- Formulário de contato das Landing Pages
-- Toda mensagem fica guardada (mesmo se o e-mail falhar ou a empresa não tiver e-mail cadastrado).
-- status: sent | failed | not_configured | no_email
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_contact_messages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  landing_page_id  uuid references landing_pages(id) on delete set null,
  company_id       uuid references companies(id) on delete set null,
  name             text not null,
  email            text,
  phone            text,
  message          text not null,
  sent_to          text,
  status           text not null,
  error            text,
  created_at       timestamptz not null default now()
);
create index if not exists lp_contact_messages_lp_idx on lp_contact_messages (landing_page_id, created_at desc);

alter table lp_contact_messages enable row level security;
