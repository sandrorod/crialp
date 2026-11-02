-- A manutenção dos prints (060) terminou: a senha temporária sai do banco
delete from lp_settings where key = 'maintenance_screenshots';
