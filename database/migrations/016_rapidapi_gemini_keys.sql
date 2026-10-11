-- ════════════════════════════════════════════════════════════════
-- Chaves do RapidAPI para o Gemini: substituem as chaves do Gemini quando estão todas desativadas.
-- A mesma chave do RapidAPI pode estar nas duas listas (Maps e Gemini): no RapidAPI uma chave
-- vale para todas as APIs assinadas, então a chave passa a ser única por provedor.
-- ════════════════════════════════════════════════════════════════

alter table ai_api_keys drop constraint if exists ai_api_keys_provider_check;
alter table ai_api_keys add constraint ai_api_keys_provider_check check (provider in ('gemini', 'rapidapi', 'rapidapi_gemini'));

alter table ai_api_keys drop constraint if exists ai_api_keys_key_hash_key;
create unique index if not exists ai_api_keys_provider_key_hash_idx on ai_api_keys (provider, key_hash);
