-- atendimento_lp: título de cada resposta (mostrado na lista de Configurações → Atendimento)
alter table atendimento_lp add column if not exists titulo text;
