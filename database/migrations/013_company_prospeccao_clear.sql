-- Limpa a prospecção de todas as empresas: campo passa a aceitar vazio (null),
-- sem valor padrão, e todos os registros atuais ficam vazios (roda uma única vez)
alter table companies alter column prospeccao drop default;
alter table companies alter column prospeccao drop not null;
update companies set prospeccao = null where prospeccao is not null;
