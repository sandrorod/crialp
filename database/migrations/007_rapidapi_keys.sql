-- ════════════════════════════════════════════════════════════════
-- Chaves do RapidAPI (pesquisa de empresas) no mesmo cadastro/rodízio das chaves do Gemini
-- ════════════════════════════════════════════════════════════════

alter table ai_api_keys drop constraint if exists ai_api_keys_provider_check;
alter table ai_api_keys add constraint ai_api_keys_provider_check check (provider in ('gemini', 'rapidapi'));
