import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { one, query } from '../src/db/pool.js';
import { closeDb, resetDb, seed, startServer } from './helpers.js';

/** Manutenção temporária: LPs de empresas com WP verificado vão para o vendedor Hermano, só com a senha certa. */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
const TOKEN = 'senha-de-teste-da-manutencao';
const call = (token?: string, body: object = {}) =>
  fetch(`${base}/api/maintenance/assign-seller`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-maintenance-token': token } : {}) },
    body: JSON.stringify(body),
  });
const sellerOf = async (lpId: string) => (await one<{ seller_id: string | null }>('select seller_id from landing_pages where id = $1', [lpId]))!.seller_id;

before(async () => {
  await resetDb();
  s = await seed();
  await query(`insert into lp_settings (key, value) values ('maintenance_assign_seller', $1) on conflict (key) do update set value = excluded.value`, [
    JSON.stringify({ token_sha256: crypto.createHash('sha256').update(TOKEN).digest('hex'), expires_at: '2099-01-01T00:00:00Z' }),
  ]);
  await query(`update users set name = 'Hermano Silva' where id = $1`, [s.sellerA]);
  await query(`update companies set wp_verificado = '+5511999990000' where id = $1`, [s.a1.companyId]);
  await query(`update companies set wp_verificado = '  ' where id = $1`, [s.a2.companyId]);
  await query(`update companies set wp_verificado = '+5511888880000' where id = $1`, [s.b1.companyId]);
  await query('update landing_pages set seller_id = null');
  ({ base, close } = await startServer());
});
after(async () => {
  await close();
  await closeDb();
});

describe('Manutenção: atribuir LPs com WP verificado ao Hermano', () => {
  it('sem a senha certa a rota não existe', async () => {
    assert.equal((await call()).status, 404);
    assert.equal((await call('errada')).status, 404);
  });

  it('prévia não altera nada', async () => {
    const r = await (await call(TOKEN)).json();
    assert.deepEqual(r.preview, [{ current: '(sem vendedor)', total: 1 }]);
    assert.equal(await sellerOf(s.a1.lpId), null);
  });

  it('aplica só às LPs da organização dele com WP verificado preenchido', async () => {
    const r = await (await call(TOKEN, { apply: true })).json();
    assert.equal(r.updated, 1);
    assert.equal(r.total_with_wp_verificado, 1);
    assert.equal(await sellerOf(s.a1.lpId), s.sellerA);
    assert.equal(await sellerOf(s.a2.lpId), null);
    assert.equal(await sellerOf(s.b1.lpId), null);
  });
});
