import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Andamento da edição da LP: "editar" (padrão) ou "pronta", com filtro "Pronta" na lista de empresas. */
let close: () => Promise<unknown>;
let base: string;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

const listIds = async (status?: string) =>
  ((await (await dono.call('GET', `/api/companies${status ? `?status=${status}` : ''}`)).json()) as { items: { id: string; edit_status: string | null }[] })
    .items;

before(async () => {
  await resetDb();
  s = await seed();
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Editar / Pronta nas Landing Pages', () => {
  it('toda LP começa como "editar" (inclusive as que já existiam)', async () => {
    const lp = await (await dono.call('GET', `/api/landing-pages/${s.a1.lpId}`)).json();
    assert.equal(lp.edit_status, 'editar');
    assert.deepEqual(await listIds('pronta'), []);
  });

  it('marca como "pronta" e o filtro "Pronta" da lista de empresas mostra só ela', async () => {
    const res = await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/edit-status`, { edit_status: 'pronta' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).edit_status, 'pronta');
    const ready = await listIds('pronta');
    assert.deepEqual(
      ready.map((c) => c.id),
      [s.a1.companyId],
    );
    assert.equal(ready[0].edit_status, 'pronta');
    // Sem filtro, as duas empresas da organização continuam na lista
    assert.equal((await listIds()).length, 2);
  });

  it('volta para "editar" e recusa outro valor', async () => {
    assert.equal((await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/edit-status`, { edit_status: 'editar' })).status, 200);
    assert.deepEqual(await listIds('pronta'), []);
    assert.equal((await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/edit-status`, { edit_status: 'publicada' })).status, 400);
  });

  it('não muda ativa/inativa, e o banco recusa valor fora de editar/pronta', async () => {
    const before = (await query<{ status: string }>('select status from landing_pages where id = $1', [s.a1.lpId])).rows[0].status;
    await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/edit-status`, { edit_status: 'pronta' });
    assert.equal((await query<{ status: string }>('select status from landing_pages where id = $1', [s.a1.lpId])).rows[0].status, before);
    await assert.rejects(query(`update landing_pages set edit_status = 'outra' where id = $1`, [s.a1.lpId]));
  });

  it('cliente e vendedor não alteram (só a equipe, como o ativar/desativar)', async () => {
    await query('update landing_pages set seller_id = $1 where id = $2', [s.sellerA, s.a1.lpId]);
    await query(`update companies set prospeccao = 'sim' where id = $1`, [s.a1.companyId]);
    for (const email of ['vendedor-a@teste.dev', 'cliente-a@teste.dev']) {
      const c = client(base);
      await c.login(email);
      assert.equal((await c.call('PATCH', `/api/landing-pages/${s.a1.lpId}/edit-status`, { edit_status: 'editar' })).status, 403, email);
    }
  });

  it('LP de outra organização: 404', async () => {
    assert.equal((await dono.call('PATCH', `/api/landing-pages/${s.b1.lpId}/edit-status`, { edit_status: 'pronta' })).status, 404);
  });
});
