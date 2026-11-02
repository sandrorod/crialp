-- A manutenção de atribuir ao Hermano as LPs com WP verificado (062) terminou: a senha temporária sai do banco
delete from lp_settings where key = 'maintenance_assign_seller';
