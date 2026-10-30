import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query } from '../src/db/pool.js';
import { closeDb, resetDb, seed, startServer } from './helpers.js';

/** Manutenção temporária: refazer os prints das LPs ativas, só com a senha certa e dentro do prazo. */
let base: string;
let close: () => Promise<unknown>;
const TOKEN = 'senha-de-teste-da-manutencao';
const setCfg = (expires: string) =>
  query(`insert into lp_settings (key, value) values ('maintenance_screenshots', $1) on conflict (key) do update set value = excluded.value`, [
    JSON.stringify({ token_sha256: crypto.createHash('sha256').update(TOKEN).digest('hex'), expires_at: expires }),
  ]);
const call = (token?: string, body: object = {}) =>
  fetch(`${base}/api/maintenance/screenshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-maintenance-token': token } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  await resetDb();
  await seed();
  ({ base, close } = await startServer());
});
after(async () => {
  await close();
  await closeDb();
});

describe('Manutenção: prints das LPs ativas', () => {
  it('sem senha, com senha errada ou vencida: como se a rota não existisse', async () => {
    await setCfg('2999-01-01T00:00:00Z');
    assert.equal((await call()).status, 404);
    assert.equal((await call('errada')).status, 404);
    await setCfg('2000-01-01T00:00:00Z');
    assert.equal((await call(TOKEN)).status, 404);
  });

  it('com a senha: passa pelas LPs ativas e diz quantas faltam', async () => {
    await setCfg('2999-01-01T00:00:00Z');
    const r = await call(TOKEN);
    assert.equal(r.status, 200);
    const body = (await r.json()) as { done: { id: string }[]; next_after: string; remaining: number };
    const active = await query<{ id: string }>(`select id from landing_pages where status = 'ativa' order by id`);
    assert.deepEqual(
      body.done.map((d) => d.id),
      active.rows.map((x) => x.id),
    );
    assert.equal(body.remaining, 0);
  });
});
