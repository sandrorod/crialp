-- Manutenção temporária de novo: refazer o print (e o envio ao Google Drive) das LPs ativas. Só o hash da senha; vale até 03/11.
insert into lp_settings (key, value) values ('maintenance_screenshots', '{"token_sha256":"50b31b96b4e9c036775a2153443ea64e96f8d9cf109d81ebc5bc06bb449f93c4","expires_at":"2026-11-03T23:59:59Z"}')
on conflict (key) do update set value = excluded.value, updated_at = now();
