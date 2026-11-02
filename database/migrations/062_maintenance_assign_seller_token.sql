-- Manutenção temporária: atribuir ao vendedor Hermano as LPs cuja empresa tem WP verificado. Só o hash da senha; vale até 03/11.
insert into lp_settings (key, value) values ('maintenance_assign_seller', '{"token_sha256":"7ed548c51ef4a1ff3b0e83748a2cedcdc29c01016b2b1515b1b6045d8af4a6d5","expires_at":"2026-11-03T23:59:59Z"}')
on conflict (key) do update set value = excluded.value, updated_at = now();
