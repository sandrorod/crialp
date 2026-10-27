import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Vendedor vê só as empresas atribuídas a ele (Landing Page com ele de vendedor) e com Prospecção = Sim;
 * fora disso (outro vendedor, sem atribuição, vazio, "não"), não vê. Vale no CRM e em Vendas.
 */
let close: () => Promise<unknown>;
let base: string;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

const sellerSees = async () => {
  const v = client(base);
  assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
  const crm = ((await (await v.call('GET', '/api/crm/companies')).json()) as { id: string }[]).map((c) => c.id).sort();
  const sales = ((await (await v.call('GET', '/api/sales/companies')).json()) as { items: { id: string }[] }).items.map((c) => c.id).sort();
  const crmDetail = (await v.call('GET', `/api/crm/companies/${s.a1.companyId}`)).status;
  return { crm, sales, crmDetail };
};

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

describe('Acesso do vendedor pelo campo Prospecção', () => {
  it('campo vazio: o vendedor não vê a empresa', async () => {
    const r = await sellerSees();
    assert.deepEqual(r.crm, []);
    assert.deepEqual(r.sales, []);
    assert.equal(r.crmDetail, 404);
  });

  it('só a gerência marca; com "Sim" mas sem a empresa atribuída a ele, o vendedor não vê', async () => {
    const v = client(base);
    await v.login('vendedor-a@teste.dev');
    assert.equal((await v.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: true })).status, 403);
    assert.equal((await dono.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: true })).status, 200);
    const r = await sellerSees();
    assert.deepEqual(r.crm, []);
    assert.deepEqual(r.sales, []);
    assert.equal(r.crmDetail, 404);
  });

  it('atribuída a ele e com "Sim": o vendedor vê (no CRM e em Vendas)', async () => {
    await query('update landing_pages set seller_id = $1 where company_id = any($2)', [s.sellerA, [s.a1.companyId, s.a2.companyId]]);
    const r = await sellerSees();
    assert.deepEqual(r.crm, [s.a1.companyId]);
    assert.deepEqual(r.sales, [s.a1.companyId]);
    assert.equal(r.crmDetail, 200);
  });

  it('só "sim" libera: outro valor preenchido no banco não', async () => {
    await query(`update companies set prospeccao = 'em andamento' where id = $1`, [s.a2.companyId]);
    assert.deepEqual((await sellerSees()).crm, [s.a1.companyId]);
    await query(`update companies set prospeccao = 'Sim' where id = $1`, [s.a2.companyId]);
    assert.deepEqual((await sellerSees()).crm, [s.a1.companyId, s.a2.companyId].sort());
    await query(`update companies set prospeccao = null where id = $1`, [s.a2.companyId]);
  });

  it('"Não" grava "não" e esconde a empresa; a lista da gerência mostra o campo', async () => {
    await dono.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: false });
    const row = (await query<{ prospeccao: string | null }>('select prospeccao from companies where id = $1', [s.a1.companyId])).rows[0];
    assert.equal(row.prospeccao, 'não');
    assert.deepEqual((await sellerSees()).crm, []);
    const list = (await (await dono.call('GET', '/api/crm/companies')).json()) as { id: string; prospecting: boolean | null }[];
    assert.equal(list.find((c) => c.id === s.a1.companyId)?.prospecting, false);
  });

  it('campo vazio esconde a empresa e aparece como vazio (null) na lista da gerência', async () => {
    await dono.call('PATCH', `/api/companies/${s.a1.companyId}/prospeccao`, { prospecting: null });
    const row = (await query<{ prospeccao: string | null }>('select prospeccao from companies where id = $1', [s.a1.companyId])).rows[0];
    assert.equal(row.prospeccao, null);
    assert.deepEqual((await sellerSees()).crm, []);
    const list = (await (await dono.call('GET', '/api/crm/companies')).json()) as { id: string; prospecting: boolean | null }[];
    assert.equal(list.find((c) => c.id === s.a1.companyId)?.prospecting, null);
  });
});
