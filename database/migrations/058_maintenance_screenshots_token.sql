-- ════════════════════════════════════════════════════════════════
-- Manutenção temporária: refazer o print (e o envio ao Google Drive) de todas as LPs ativas.
-- Só o hash da senha fica aqui; a rota deixa de funcionar depois do prazo.
-- ════════════════════════════════════════════════════════════════

insert into lp_settings (key, value) values ('maintenance_screenshots', '{"token_sha256":"9da6509463edca43791a4030c44588c55a34561f630cdb3a642fc98919ee009f","expires_at":"2026-11-01T23:59:59Z"}')
on conflict (key) do update set value = excluded.value, updated_at = now();
