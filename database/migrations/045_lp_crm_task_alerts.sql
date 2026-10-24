-- ════════════════════════════════════════════════════════════════
-- CRM: aviso de tarefa nova (popup no CRM até a pessoa fechar)
-- Uma linha por pessoa avisada: quem criou, o responsável pela tarefa e o(s) vendedor(es) da empresa
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_crm_task_alerts (
  task_id       uuid not null references lp_crm_tasks(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  dismissed_at  timestamptz,
  primary key (task_id, user_id)
);
create index if not exists lp_crm_task_alerts_pending_idx on lp_crm_task_alerts (user_id) where dismissed_at is null;

alter table lp_crm_task_alerts enable row level security;
