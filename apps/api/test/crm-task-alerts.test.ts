import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

let close: () => Promise<unknown>;
let adminA: ReturnType<typeof client>;
let vendedorA: ReturnType<typeof client>;
let donoA: ReturnType<typeof client>;
let s: Awaited<ReturnType<typeof seed>>;

before(async () => {
  await resetDb();
  s = await seed();
  // Vendedor A é o responsável pela Padaria A (Landing Page atribuída a ele)
  await query('update landing_pages set seller_id = $1 where id = $2', [s.sellerA, s.a1.lpId]);
  let base: string;
  ({ base, close } = await startServer());
  adminA = client(base);
  vendedorA = client(base);
  donoA = client(base);
  assert.equal((await adminA.login('admin-a@teste.dev')).status, 200);
  assert.equal((await vendedorA.login('vendedor-a@teste.dev')).status, 200);
  assert.equal((await donoA.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

const alerts = async (c: ReturnType<typeof client>) =>
  ((await (await c.call('GET', '/api/crm/task-alerts')).json()) as { id: string; title: string }[]).map((a) => a.title);

describe('Popup de tarefa nova (/api/crm/task-alerts)', () => {
  let taskId: string;

  it('avisa quem criou e o vendedor responsável pela empresa, não o resto da equipe', async () => {
    const res = await adminA.call('POST', '/api/crm/tasks', { title: 'Ligar para a padaria', description: null, due_at: null, company_id: s.a1.companyId });
    assert.equal(res.status, 201);
    taskId = (await res.json()).id;
    assert.deepEqual(await alerts(adminA), ['Ligar para a padaria']);
    assert.deepEqual(await alerts(vendedorA), ['Ligar para a padaria']);
    assert.deepEqual(await alerts(donoA), []);
  });

  it('avisa também o responsável escolhido para a tarefa', async () => {
    await adminA.call('POST', '/api/crm/tasks', {
      title: 'Mandar proposta',
      description: null,
      due_at: null,
      company_id: s.a2.companyId,
      assignee_id: s.ownerA,
    });
    assert.deepEqual(await alerts(donoA), ['Mandar proposta']);
    assert.deepEqual(await alerts(vendedorA), ['Ligar para a padaria']);
  });

  it('fechar o popup some só para quem fechou, e não volta', async () => {
    const res = await vendedorA.call('POST', '/api/crm/task-alerts/dismiss', { ids: [taskId] });
    assert.equal(res.status, 200);
    assert.deepEqual(await alerts(vendedorA), []);
    assert.deepEqual(await alerts(adminA), ['Ligar para a padaria', 'Mandar proposta']);
  });
});
