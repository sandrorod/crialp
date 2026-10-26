-- ════════════════════════════════════════════════════════════════
-- 1) Chave do GIPHY (galeria de GIFs do CRM) no rodízio de chaves de Configurações
-- 2) Vendedor limpo em todas as empresas (o vendedor fica na Landing Page de cada empresa)
-- 3) Prospecção: o vendedor passa a ver toda empresa com o campo preenchido (qualquer valor).
--    Valores que significavam "não" viram vazio, para não liberarem o acesso.
-- ════════════════════════════════════════════════════════════════

alter table ai_api_keys drop constraint if exists ai_api_keys_provider_check;
alter table ai_api_keys add constraint ai_api_keys_provider_check check (provider in ('gemini', 'rapidapi', 'rapidapi_gemini', 'giphy'));

update landing_pages set seller_id = null where seller_id is not null;

update companies set prospeccao = null
 where prospeccao is not null
   and lower(trim(prospeccao)) in ('', 'nao', 'não', 'false', 'n', 'no', '0');
