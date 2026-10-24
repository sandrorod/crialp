import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../src/db/pool.js';
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

const ids = async (c: ReturnType<typeof client>) =>
  ((await (await c.call('GET', '/api/crm/quick-replies')).json()) as { shortcut: string }[]).map((r) => r.shortcut);

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

  it('edita nome e texto (quem criou); vendedor não altera a mensagem do dono', async () => {
    assert.equal((await vendedorA.call('PUT', `/api/crm/quick-replies/${id}`, { shortcut: 'preco', body: 'x' })).status, 403);
    assert.equal((await vendedorA.call('DELETE', `/api/crm/quick-replies/${id}`)).status, 403);
    const res = await donoA.call('PUT', `/api/crm/quick-replies/${id}`, { shortcut: 'preco', body: 'Novo valor: R$ 79,90.' });
    assert.equal(res.status, 200);
    const row = await res.json();
    assert.equal(row.shortcut, 'preco');
    assert.equal(row.body, 'Novo valor: R$ 79,90.');
    assert.equal(row.visibility, 'all');
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

describe('Quem pode usar (pública ou só subusuários escolhidos)', () => {
  let vendedorId: string;
  let adminA: ReturnType<typeof client>;

  before(async () => {
    adminA = client(base);
    assert.equal((await adminA.login('admin-a@teste.dev')).status, 200);
    const users = (await (await donoA.call('GET', '/api/crm/users')).json()) as { id: string; name: string }[];
    vendedorId = users.find((u) => u.name === 'vendedor-a')!.id;
  });

  it('privada para um vendedor: ele vê e usa; o admin vê para gerenciar, mas não usa', async () => {
    const res = await donoA.call('POST', '/api/crm/quick-replies', { shortcut: 'tabela-vip', body: 'Tabela VIP', visibility: 'users', user_ids: [vendedorId] });
    assert.equal(res.status, 201);
    const row = await res.json();
    assert.equal(row.visibility, 'users');
    assert.deepEqual(
      row.users.map((u: { name: string }) => u.name),
      ['vendedor-a'],
    );
    assert.equal(row.can_use, true, 'quem criou sempre usa');

    const doVendedor = (
      (await (await vendedorA.call('GET', '/api/crm/quick-replies')).json()) as { shortcut: string; can_use: boolean; can_edit: boolean }[]
    ).find((r) => r.shortcut === 'tabela-vip')!;
    assert.equal(doVendedor.can_use, true);
    assert.equal(doVendedor.can_edit, false);

    const doAdmin = ((await (await adminA.call('GET', '/api/crm/quick-replies')).json()) as { shortcut: string; can_use: boolean; can_edit: boolean }[]).find(
      (r) => r.shortcut === 'tabela-vip',
    )!;
    assert.equal(doAdmin.can_use, false);
    assert.equal(doAdmin.can_edit, true);
  });

  it('privada só para quem criou: outro vendedor nem vê', async () => {
    const res = await vendedorA.call('POST', '/api/crm/quick-replies', { shortcut: 'minha', body: 'Só minha', visibility: 'users', user_ids: [] });
    assert.equal(res.status, 201);
    assert.ok((await ids(vendedorA)).includes('minha'));
    // dono (gerencia) vê; e a mensagem do vendedor ele pode editar por ser dono
    assert.ok((await ids(donoA)).includes('minha'));
  });

  it('trocar para pública libera para toda a equipe e limpa a lista', async () => {
    const vip = ((await (await donoA.call('GET', '/api/crm/quick-replies')).json()) as { id: string; shortcut: string }[]).find(
      (r) => r.shortcut === 'tabela-vip',
    )!;
    const res = await donoA.call('PUT', `/api/crm/quick-replies/${vip.id}`, {
      shortcut: 'tabela-vip',
      body: 'Tabela VIP',
      visibility: 'all',
      user_ids: [vendedorId],
    });
    const row = await res.json();
    assert.equal(row.visibility, 'all');
    assert.deepEqual(row.users, []);
    const doAdmin = ((await (await adminA.call('GET', '/api/crm/quick-replies')).json()) as { shortcut: string; can_use: boolean }[]).find(
      (r) => r.shortcut === 'tabela-vip',
    )!;
    assert.equal(doAdmin.can_use, true);
  });

  it('usuário de outra organização na lista é ignorado', async () => {
    const outro = await one<{ id: string }>(`select id from users where email = 'dono-b@teste.dev'`);
    const res = await donoA.call('POST', '/api/crm/quick-replies', { shortcut: 'restrita', body: 'x', visibility: 'users', user_ids: [outro!.id, vendedorId] });
    assert.deepEqual(
      (await res.json()).users.map((u: { name: string }) => u.name),
      ['vendedor-a'],
    );
  });
});
