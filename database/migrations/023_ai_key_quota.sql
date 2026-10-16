-- ════════════════════════════════════════════════════════════════
-- Cota das chaves do RapidAPI (cabeçalhos x-ratelimit-* de cada resposta), mostrada em Configurações:
-- { "<nome>": { "limit": n, "remaining": n, "reset_at": iso } } — ex.: requests, tokens
-- ════════════════════════════════════════════════════════════════

alter table ai_api_keys add column if not exists quota jsonb;
alter table ai_api_keys add column if not exists quota_at timestamptz;
