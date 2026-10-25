import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Vendedor só acessa a empresa com as duas coisas: Landing Page atribuída a ele E prospecção = "sim"
 * (vazio ou "não" = sem acesso). Vale no CRM, em Vendas e nos sites que ele edita.
 */
let close: () => Promise<unknown>;
let base: string;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

const sellerSees = async () => {
  // Nova sessão a cada consulta: a lista de sites do vendedor é lida no login/requisição
  const v = client(base);
  assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
  const crm = ((await (await v.call('GET', '/api/crm/companies')).json()) as { id: string }[]).map((c) => c.id);
  const sales = ((await (await v.call('GET', '/api/sales/companies')).json()) as { items: { id: string }[] }).items.map((c) => c.id);
  const sites = ((await (await v.call('GET', '/api/auth/my-sites')).json()) as { items: { id: string }[] }).items.map((p) => p.id);
  const crmDetail = (await v.call('GET', `/api/crm/companies/${s.a1.companyId}`)).status;
  const editLp = (await v.call('GET', `/api/landing-pages/${s.a1.lpId}`)).status;
  return { crm, sales, sites, crmDetail, editLp };
};

before(async () => {
  await resetDb();
  s = await seed();
  // Padaria A atribuída ao vendedor; Oficina A sem vendedor
  await query('update landing_pages set seller_id = $1 where id = $2', [s.sellerA, s.a1.lpId]);
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Acesso do vendedor depende da prospecção', () => {
  it('atribuída mas com prospecção vazia: o vendedor não vê a empresa em lugar nenhum', async () => {
    const r = await sellerSees();
    assert.deepEqual(r.crm, []);
    assert.deepEqual(r.sales, []);
    assert.deepEqual(r.sites, []);
    assert.equal(r.crmDetail, 404);
    assert.equal(r.editLp, 403);
  });

  it('só a gerência marca a prospecção', async () => {
    const v = client(base);
    await v.login('vendedor-a@teste.dev');
    assert.equal((await v.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: true })).status, 403);
    const res = await dono.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: true });
    assert.equal(res.status, 200);
  });

  it('atribuída e com prospecção = sim: o vendedor vê no CRM, em Vendas e edita o site', async () => {
    const r = await sellerSees();
    assert.deepEqual(r.crm, [s.a1.companyId]);
    assert.deepEqual(r.sales, [s.a1.companyId]);
    assert.deepEqual(r.sites, [s.a1.lpId]);
    assert.equal(r.crmDetail, 200);
    assert.equal(r.editLp, 200);
  });

  it('prospecção = sim sem estar atribuída a ele: continua sem acesso', async () => {
    await dono.call('PATCH', `/api/companies/${s.a2.companyId}/prospeccao`, { prospecting: true });
    const r = await sellerSees();
    assert.ok(!r.crm.includes(s.a2.companyId));
    assert.ok(!r.sales.includes(s.a2.companyId));
  });

  it('a gerência vê o campo na lista do CRM; desmarcar tira o acesso do vendedor', async () => {
    const list = (await (await dono.call('GET', '/api/crm/companies')).json()) as { id: string; prospecting: boolean }[];
    assert.equal(list.find((c) => c.id === s.a1.companyId)?.prospecting, true);
    await dono.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: false });
    const r = await sellerSees();
    assert.deepEqual(r.crm, []);
    assert.deepEqual(r.sites, []);
  });

  it('"Sim" vale com maiúsculas e espaços (valor editado direto no banco)', async () => {
    await query(`update companies set prospeccao = ' SIM ' where id = $1`, [s.a1.companyId]);
    assert.deepEqual((await sellerSees()).crm, [s.a1.companyId]);
  });
});
