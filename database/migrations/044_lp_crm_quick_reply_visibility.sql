-- ════════════════════════════════════════════════════════════════
-- CRM: quem pode usar cada mensagem pronta
-- visibility 'all' = toda a equipe; 'users' = só quem criou e os subusuários escolhidos
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_quick_replies add column if not exists created_by uuid references users(id) on delete set null;
alter table lp_crm_quick_replies add column if not exists visibility text not null default 'all';
alter table lp_crm_quick_replies drop constraint if exists lp_crm_quick_replies_visibility_chk;
alter table lp_crm_quick_replies add constraint lp_crm_quick_replies_visibility_chk check (visibility in ('all', 'users'));

create table if not exists lp_crm_quick_reply_users (
  quick_reply_id  uuid not null references lp_crm_quick_replies(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  primary key (quick_reply_id, user_id)
);
create index if not exists lp_crm_quick_reply_users_user_idx on lp_crm_quick_reply_users (user_id);

alter table lp_crm_quick_reply_users enable row level security;
