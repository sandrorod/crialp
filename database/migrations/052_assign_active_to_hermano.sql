-- ════════════════════════════════════════════════════════════════
-- Atribui ao vendedor Hermano todas as Landing Pages ativas (pedido de 26/10/2026).
-- Só age se houver exatamente UM vendedor com o nome começando por "Hermano" (sem diferenciar maiúsculas
-- e acentos) em cada organização; sem nenhum ou com mais de um, não muda nada.
-- ════════════════════════════════════════════════════════════════

with hermano as (
  select organization_id, min(id::text)::uuid as id
    from users
   where role = 'seller' and lower(translate(trim(name), 'ÁÉÍÓÚáéíóúÂÊÔâêôÃÕãõÇç', 'AEIOUaeiouAEOaeoAOaoCc')) like 'hermano%'
   group by organization_id
  having count(*) = 1
)
update landing_pages lp
   set seller_id = h.id
  from hermano h
 where lp.organization_id = h.organization_id
   and lp.status = 'ativa'
   and lp.seller_id is distinct from h.id;
