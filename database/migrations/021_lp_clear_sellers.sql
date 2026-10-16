-- ════════════════════════════════════════════════════════════════
-- Vendedor passa a ser escolhido à mão (na geração ou no editor da LP):
-- limpa o vendedor de todas as páginas (o rodízio tinha atribuído todas)
-- ════════════════════════════════════════════════════════════════

update landing_pages set seller_id = null where seller_id is not null;
