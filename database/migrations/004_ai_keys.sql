-- ════════════════════════════════════════════════════════════════
-- Chaves de API da IA cadastradas pelo painel (rodízio entre elas)
-- ════════════════════════════════════════════════════════════════

create table ai_api_keys (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'gemini' check (provider in ('gemini')),
  label          text,
  -- chave criptografada (AES-256-GCM); o painel só recebe os 4 últimos caracteres
  key_encrypted  text not null,
  -- hash da chave: impede cadastrar a mesma chave duas vezes
  key_hash       text not null unique,
  last4          text not null,
  active         boolean not null default true,
  uses           bigint not null default 0,
  last_used_at   timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index ai_api_keys_provider_idx on ai_api_keys (provider, created_at);

-- Contador do rodízio: compartilhado por todas as instâncias do servidor
create table ai_key_rotation (
  provider  text primary key,
  counter   bigint not null default 0
);

alter table ai_api_keys     enable row level security;
alter table ai_key_rotation enable row level security;
