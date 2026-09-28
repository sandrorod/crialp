-- ════════════════════════════════════════════════════════════════
-- Subusuários (Administrador e Vendedor) e histórico de prospecção
-- ════════════════════════════════════════════════════════════════

-- Novo papel: vendedor ("seller"), que só acessa a área de Vendas
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('owner', 'admin', 'editor', 'seller'));

-- Lançamentos de prospecção: somente inclusão (histórico sem edição nem exclusão)
create table prospecting_notes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  user_id          uuid references users(id) on delete set null,
  -- nome do autor gravado no lançamento: o histórico continua legível se o usuário for excluído
  author_name      text not null,
  note             text not null,
  created_at       timestamptz not null default now()
);
create index prospecting_notes_company_idx on prospecting_notes (company_id, created_at desc);

-- Garante no banco que um lançamento nunca é alterado
create function prospecting_notes_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Lançamentos de prospecção não podem ser alterados.';
end;
$$;
create trigger prospecting_notes_no_update before update on prospecting_notes
  for each row execute function prospecting_notes_immutable();

alter table prospecting_notes enable row level security;
