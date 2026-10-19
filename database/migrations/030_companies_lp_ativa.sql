-- ════════════════════════════════════════════════════════════════
-- companies.lp_ativa: espelho do status da Landing Page da empresa ("ativa" / "inativa"; sem página = null).
-- Mantido por trigger em landing_pages: ativar, desativar, publicar, criar ou excluir a página
-- (pelo painel ou direto no banco) atualiza a empresa na mesma transação.
-- Empresa com mais de uma página: "ativa" se alguma estiver ativa.
-- ════════════════════════════════════════════════════════════════

alter table companies add column if not exists lp_ativa text;

-- Só lp_ativa mudou (feito pelo trigger abaixo): não mexe no updated_at da empresa,
-- que ordena listas do painel. Qualquer outra atualização continua igual a antes.
drop trigger if exists companies_updated_at on companies;
create trigger companies_updated_at before update on companies for each row
  when (not (old.lp_ativa is distinct from new.lp_ativa
             and (to_jsonb(old) - 'lp_ativa' - 'updated_at') = (to_jsonb(new) - 'lp_ativa' - 'updated_at')))
  execute function set_updated_at();

create or replace function lp_sync_company_lp_ativa() returns trigger language plpgsql as $$
declare
  ids uuid[];
begin
  ids := array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.company_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.company_id end
  ], null);
  update companies c set lp_ativa = s.value
    from (
      select c2.id,
             case when bool_or(lp.status = 'ativa') then 'ativa'
                  when count(lp.id) > 0 then 'inativa' end as value
        from companies c2
        left join landing_pages lp on lp.company_id = c2.id
       where c2.id = any(ids)
       group by c2.id
    ) s
   where c.id = s.id and c.lp_ativa is distinct from s.value;
  return null;
end;
$$;

drop trigger if exists landing_pages_sync_lp_ativa on landing_pages;
create trigger landing_pages_sync_lp_ativa
  after insert or delete or update of status, company_id on landing_pages
  for each row execute function lp_sync_company_lp_ativa();

-- Preenche as empresas existentes (sem alterar updated_at, pela condição do trigger acima)
update companies c set lp_ativa = s.value
  from (
    select c2.id,
           case when bool_or(lp.status = 'ativa') then 'ativa'
                when count(lp.id) > 0 then 'inativa' end as value
      from companies c2
      left join landing_pages lp on lp.company_id = c2.id
     group by c2.id
  ) s
 where c.id = s.id and c.lp_ativa is distinct from s.value;
