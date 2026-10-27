-- ════════════════════════════════════════════════════════════════
-- WP verificado da empresa "Stúdio Damitie" passa a ser +5562991198888 (pedido de 27/10/2026).
-- Procura pelo nome ou nome fantasia (sem diferenciar maiúsculas e acentos); só altera se houver
-- exatamente UMA empresa com esse nome no sistema. Sem nenhuma ou com mais de uma, não muda nada.
-- ════════════════════════════════════════════════════════════════

with alvo as (
  select id
    from companies
   where lower(translate(trim(name), 'ÁÉÍÓÚáéíóúÂÊÔâêôÃÕãõÇç', 'AEIOUaeiouAEOaeoAOaoCc')) = 'studio damitie'
      or lower(translate(trim(coalesce(trade_name, '')), 'ÁÉÍÓÚáéíóúÂÊÔâêôÃÕãõÇç', 'AEIOUaeiouAEOaeoAOaoCc')) = 'studio damitie'
)
update companies c
   set wp_verificado = '+5562991198888'
  from alvo
 where c.id = alvo.id
   and (select count(*) from alvo) = 1;
