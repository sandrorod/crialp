-- ════════════════════════════════════════════════════════════════
-- Combinações de cores salvas no editor da LP (aba "Cores e estilo"): estilo base,
-- cor principal, cor de destaque e cores próprias das seções, com um nome.
-- RLS ativa sem políticas: fica fora da Data API pública (chave anon) do Supabase.
-- ════════════════════════════════════════════════════════════════

create table if not exists lp_color_palettes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  preset text not null,
  primary_color text,
  accent_color text,
  sections jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lp_color_palettes_name_idx on lp_color_palettes (organization_id, lower(name));

alter table lp_color_palettes enable row level security;
