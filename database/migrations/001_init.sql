-- ════════════════════════════════════════════════════════════════
-- LP — estrutura inicial do banco
-- Compatível com PostgreSQL 13+ (local, Docker, VPS ou Supabase).
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Atualiza updated_at automaticamente
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── Multi-tenant (preparado para múltiplos usuários/organizações) ──
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table users (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  email            text not null,
  password_hash    text not null,
  role             text not null default 'admin' check (role in ('owner', 'admin', 'editor')),
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index users_email_unique on users (lower(email));

-- ─── Empresas ───────────────────────────────────────────────────────
create table companies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  created_by       uuid references users(id) on delete set null,
  name             text not null,
  trade_name       text,
  legal_name       text,
  description      text,
  segment          text,
  reference_url    text,
  logo_url         text,
  phone            text,
  mobile           text,
  whatsapp         text,
  email            text,
  address          text,
  number           text,
  neighborhood     text,
  city             text,
  state            text,
  zip_code         text,
  website          text,
  instagram        text,
  facebook         text,
  youtube          text,
  linkedin         text,
  tiktok           text,
  other_socials    jsonb not null default '[]'::jsonb,   -- [{ network, url }]
  opening_hours    text,
  -- diferenciais, argumentos de venda, público-alvo, ofertas, garantias...
  commercial_info  jsonb not null default '{}'::jsonb,
  -- metadados da coleta (páginas lidas, data, avisos)
  source_meta      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index companies_org_idx on companies (organization_id);
create index companies_name_idx on companies (lower(name));
create index companies_segment_idx on companies (lower(segment));
create index companies_city_idx on companies (lower(city));

create table company_services (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  description  text,
  benefits     jsonb not null default '[]'::jsonb,
  details      text,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index company_services_company_idx on company_services (company_id, position);

create table company_products (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  name         text not null,
  description  text,
  features     jsonb not null default '[]'::jsonb,
  benefits     jsonb not null default '[]'::jsonb,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index company_products_company_idx on company_products (company_id, position);

create table company_images (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  url            text not null,
  type           text not null default 'other'
                 check (type in ('logo', 'company', 'product', 'service', 'institutional', 'gallery', 'other')),
  alt_text       text,
  source         text not null default 'scraped' check (source in ('scraped', 'upload', 'manual')),
  -- imagens coletadas só entram na LP depois que o administrador confirma a permissão de uso
  usage_allowed  boolean not null default false,
  position       int not null default 0,
  created_at     timestamptz not null default now()
);
create index company_images_company_idx on company_images (company_id, position);

-- Depoimentos reais encontrados na fonte (nunca gerados pela IA)
create table company_testimonials (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  author       text,
  text         text not null,
  source_url   text,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index company_testimonials_company_idx on company_testimonials (company_id, position);

-- ─── Landing Pages ──────────────────────────────────────────────────
create table landing_pages (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  title            text not null,
  slug             text not null,
  status           text not null default 'inativa' check (status in ('ativa', 'inativa')),
  -- conteúdo estruturado gerado pela IA (textos por seção, ordem das seções)
  content          jsonb not null default '{}'::jsonb,
  -- direção visual (preset, cores, tipografia, variação do hero)
  theme            jsonb not null default '{}'::jsonb,
  -- snapshot HTML renderizado (exportação / hospedagem estática futura)
  html_content     text,
  seo_title        text,
  seo_description  text,
  seo_keywords     text[] not null default '{}',
  og_image         text,
  current_version  int not null default 0,
  -- domínio personalizado (preparado para o futuro)
  custom_domain    text,
  domain_status    text not null default 'none' check (domain_status in ('none', 'pending', 'verified', 'active', 'error')),
  ssl_status       text not null default 'none' check (ssl_status in ('none', 'pending', 'active', 'error')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz
);
create unique index landing_pages_slug_unique on landing_pages (slug);
create unique index landing_pages_domain_unique on landing_pages (lower(custom_domain)) where custom_domain is not null;
create index landing_pages_company_idx on landing_pages (company_id);
create index landing_pages_org_status_idx on landing_pages (organization_id, status);

create table landing_page_versions (
  id               uuid primary key default gen_random_uuid(),
  landing_page_id  uuid not null references landing_pages(id) on delete cascade,
  version          int not null,
  content          jsonb not null,   -- { content, theme, seo }
  note             text,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (landing_page_id, version)
);

-- ─── Processamentos assíncronos (análise de URL / geração) ──────────
create table jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  type             text not null check (type in ('analyze_url', 'generate_landing_page')),
  status           text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  step             int not null default 0,
  input            jsonb not null default '{}'::jsonb,
  result           jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index jobs_org_created_idx on jobs (organization_id, created_at desc);

-- ─── Triggers updated_at ────────────────────────────────────────────
create trigger organizations_updated_at before update on organizations for each row execute function set_updated_at();
create trigger users_updated_at         before update on users         for each row execute function set_updated_at();
create trigger companies_updated_at     before update on companies     for each row execute function set_updated_at();
create trigger landing_pages_updated_at before update on landing_pages for each row execute function set_updated_at();
create trigger jobs_updated_at          before update on jobs          for each row execute function set_updated_at();

-- ─── Segurança para Supabase ────────────────────────────────────────
-- A aplicação acessa o banco apenas pelo backend (como dono das tabelas,
-- que ignora RLS). Ativar RLS sem políticas bloqueia qualquer acesso
-- pela API pública do Supabase (anon/authenticated). Inofensivo em Postgres puro.
alter table organizations         enable row level security;
alter table users                 enable row level security;
alter table companies             enable row level security;
alter table company_services      enable row level security;
alter table company_products      enable row level security;
alter table company_images        enable row level security;
alter table company_testimonials  enable row level security;
alter table landing_pages         enable row level security;
alter table landing_page_versions enable row level security;
alter table jobs                  enable row level security;
