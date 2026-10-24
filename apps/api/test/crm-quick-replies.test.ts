import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

let base: string;
let close: () => Promise<unknown>;
let donoA: ReturnType<typeof client>;
let vendedorA: ReturnType<typeof client>;
let donoB: ReturnType<typeof client>;

before(async () => {
  await resetDb();
  await seed();
  ({ base, close } = await startServer());
  donoA = client(base);
  vendedorA = client(base);
  donoB = client(base);
  assert.equal((await donoA.login('dono-a@teste.dev')).status, 200);
  assert.equal((await vendedorA.login('vendedor-a@teste.dev')).status, 200);
  assert.equal((await donoB.login('dono-b@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Mensagens prontas do WhatsApp (/api/crm/quick-replies)', () => {
  let id: string;

  it('cria com o atalho sem a barra, em minúsculas', async () => {
    const res = await donoA.call('POST', '/api/crm/quick-replies', { shortcut: ' /Valor ', body: 'O plano custa R$ 99,90 por mês.\nPosso te enviar o link?' });
    assert.equal(res.status, 201);
    const row = await res.json();
    assert.equal(row.shortcut, 'valor');
    assert.equal(row.body, 'O plano custa R$ 99,90 por mês.\nPosso te enviar o link?');
    id = row.id;
  });

  it('lista em ordem alfabética, para toda a equipe da organização (vendedor também)', async () => {
    await donoA.call('POST', '/api/crm/quick-replies', { shortcut: 'agradecimento', body: 'Obrigado pelo contato!' });
    const res = await vendedorA.call('GET', '/api/crm/quick-replies');
    assert.equal(res.status, 200);
    assert.deepEqual(
      (await res.json()).map((r: { shortcut: string }) => r.shortcut),
      ['agradecimento', 'valor'],
    );
  });

  it('não deixa repetir o atalho (nem com maiúsculas)', async () => {
    const res = await donoA.call('POST', '/api/crm/quick-replies', { shortcut: 'VALOR', body: 'Outro texto' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /Já existe/);
  });

  it('recusa atalho com espaço, atalho vazio e texto vazio', async () => {
    for (const body of [
      { shortcut: 'tabela de preços', body: 'x' },
      { shortcut: '/', body: 'x' },
      { shortcut: 'ok', body: '   ' },
    ]) {
      assert.equal((await donoA.call('POST', '/api/crm/quick-replies', body)).status, 400, JSON.stringify(body));
    }
  });

  it('edita nome e texto', async () => {
    const res = await vendedorA.call('PUT', `/api/crm/quick-replies/${id}`, { shortcut: 'preco', body: 'Novo valor: R$ 79,90.' });
    assert.equal(res.status, 200);
    const row = await res.json();
    assert.equal(row.shortcut, 'preco');
    assert.equal(row.body, 'Novo valor: R$ 79,90.');
  });

  it('outra organização não vê, não edita e não exclui', async () => {
    assert.deepEqual(await (await donoB.call('GET', '/api/crm/quick-replies')).json(), []);
    assert.equal((await donoB.call('PUT', `/api/crm/quick-replies/${id}`, { shortcut: 'x', body: 'invadido' })).status, 404);
    assert.equal((await donoB.call('DELETE', `/api/crm/quick-replies/${id}`)).status, 404);
    // O mesmo atalho pode existir em outra organização
    assert.equal((await donoB.call('POST', '/api/crm/quick-replies', { shortcut: 'preco', body: 'Preço da B' })).status, 201);
  });

  it('exclui', async () => {
    assert.equal((await donoA.call('DELETE', `/api/crm/quick-replies/${id}`)).status, 200);
    const list = await (await donoA.call('GET', '/api/crm/quick-replies')).json();
    assert.ok(!list.some((r: { id: string }) => r.id === id));
  });
});
