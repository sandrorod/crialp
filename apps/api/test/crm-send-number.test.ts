import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

let close: () => Promise<unknown>;
let donoA: ReturnType<typeof client>;
let adminA: ReturnType<typeof client>;
let vendedorA: ReturnType<typeof client>;
let s: Awaited<ReturnType<typeof seed>>;

before(async () => {
  await resetDb();
  s = await seed();
  let base: string;
  ({ base, close } = await startServer());
  donoA = client(base);
  adminA = client(base);
  vendedorA = client(base);
  assert.equal((await donoA.login('dono-a@teste.dev')).status, 200);
  assert.equal((await adminA.login('admin-a@teste.dev')).status, 200);
  assert.equal((await vendedorA.login('vendedor-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

const can = async (c: ReturnType<typeof client>) => ((await (await c.call('GET', '/api/crm/permissions')).json()) as { free_number: boolean }).free_number;

describe('Conversa com número fora do cadastro (POST /api/crm/messages { phone })', () => {
  it('por padrão só dono e admin podem', async () => {
    assert.equal(await can(donoA), true);
    assert.equal(await can(adminA), true);
    assert.equal(await can(vendedorA), false);
    for (const path of ['/api/crm/messages', '/api/crm/messages/media']) {
      const body = path.endsWith('media') ? { phone: '11912345678', kind: 'image', mime: 'image/png', data: 'aGk=' } : { phone: '11912345678', text: 'Oi' };
      assert.equal((await vendedorA.call('POST', path, body)).status, 403, path);
    }
  });

  it('recusa número curto ou longo demais', async () => {
    for (const phone of ['123', '1191234', '1234567890123456']) {
      const res = await donoA.call('POST', '/api/crm/messages', { phone, text: 'Oi' });
      assert.equal(res.status, 400, phone);
      assert.match((await res.json()).error, /inválido/);
    }
  });

  it('só a gerência configura; o dono não pode ser desmarcado', async () => {
    assert.equal((await vendedorA.call('GET', '/api/crm/free-number-users')).status, 403);
    assert.equal((await vendedorA.call('PUT', `/api/crm/free-number-users/${s.sellerA}`, { allowed: true })).status, 403);
    assert.equal((await adminA.call('PUT', `/api/crm/free-number-users/${s.ownerA}`, { allowed: false })).status, 400);
    const list = (await (await adminA.call('GET', '/api/crm/free-number-users')).json()) as { id: string; allowed: boolean }[];
    assert.deepEqual(
      list.map((u) => [u.id, u.allowed]),
      [
        [s.ownerA, true],
        [s.adminA, true],
        [s.sellerA, false],
      ],
    );
  });

  it('admin libera o vendedor, e pode tirar de outro admin', async () => {
    assert.equal((await adminA.call('PUT', `/api/crm/free-number-users/${s.sellerA}`, { allowed: true })).status, 200);
    assert.equal(await can(vendedorA), true);
    // Passa da permissão: o erro agora é o do número
    assert.equal((await vendedorA.call('POST', '/api/crm/messages', { phone: '123', text: 'Oi' })).status, 400);
    assert.equal((await donoA.call('PUT', `/api/crm/free-number-users/${s.adminA}`, { allowed: false })).status, 200);
    assert.equal(await can(adminA), false);
  });

  it('vendedor liberado não fala com número de empresa de outra carteira', async () => {
    await query('update companies set whatsapp = $1 where id = $2', ['(11) 98888-7777', s.a2.companyId]);
    const res = await vendedorA.call('POST', '/api/crm/messages', { phone: '11988887777', text: 'Oi' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /outra carteira/);
  });
});
