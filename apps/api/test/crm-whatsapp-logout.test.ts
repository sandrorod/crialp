import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Desconectar o WhatsApp do CRM com a Evolution API simulada. A Evolution às vezes responde 500
 * "Connection Closed" ao logout com o estado ainda "open": o CRM reinicia, tenta de novo e, em último
 * caso, apaga a instância (o "Conectar" recria).
 */
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
const realFetch = globalThis.fetch;
let calls: string[] = [];
// Comportamento da Evolution simulada em cada teste
let evo: { logoutFails: number; state: string; deleteFails?: boolean };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

before(async () => {
  await resetDb();
  await seed();
  let base: string;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('http://evo.test')) return realFetch(input, init);
    const path = new URL(url).pathname;
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path.startsWith('/instance/logout/')) {
      if (evo.logoutFails > 0) {
        evo.logoutFails--;
        return json(500, { status: 500, response: { message: ['Error: Connection Closed'] } });
      }
      evo.state = 'close';
      return json(200, { status: 'SUCCESS' });
    }
    if (path.startsWith('/instance/restart/')) return json(200, { instance: { state: 'open' } });
    if (path.startsWith('/instance/connectionState/')) return json(200, { instance: { state: evo.state } });
    if (path.startsWith('/webhook/set/')) return json(200, { webhook: {} });
    if (path.startsWith('/instance/delete/')) return evo.deleteFails ? json(500, { response: { message: ['falhou'] } }) : json(200, { status: 'SUCCESS' });
    return json(404, {});
  });
  assert.equal((await dono.call('PUT', '/api/crm/whatsapp', { api_url: 'http://evo.test', api_key: 'chave', instance: 'lp_teste' })).status, 200);
});
beforeEach(() => {
  calls = [];
});
after(async () => {
  mock.restoreAll();
  await close();
  await closeDb();
});

const logout = async () => {
  const res = await dono.call('POST', '/api/crm/whatsapp/logout');
  return { status: res.status, body: await res.json() };
};

describe('Desconectar o WhatsApp do CRM', () => {
  it('logout normal', async () => {
    evo = { logoutFails: 0, state: 'open' };
    assert.deepEqual(await logout(), { status: 200, body: { ok: true, method: 'logout' } });
    assert.deepEqual(calls, ['DELETE /instance/logout/lp_teste']);
  });

  it('"Connection Closed" no 1º logout: reinicia a instância e o 2º logout funciona', async () => {
    evo = { logoutFails: 1, state: 'open' };
    assert.deepEqual((await logout()).body, { ok: true, method: 'restart' });
    assert.deepEqual(calls, ['DELETE /instance/logout/lp_teste', 'PUT /instance/restart/lp_teste', 'DELETE /instance/logout/lp_teste']);
  });

  it('logout sempre falha mas a conexão já caiu: dá como desconectado', async () => {
    evo = { logoutFails: 99, state: 'close' };
    assert.deepEqual((await logout()).body, { ok: true, method: 'closed', state: 'close' });
    assert.ok(!calls.some((c) => c.includes('/delete/')));
  });

  it('logout sempre falha e continua "open": apaga a instância', async () => {
    evo = { logoutFails: 99, state: 'open' };
    assert.deepEqual((await logout()).body, { ok: true, method: 'delete' });
    assert.equal(calls.at(-1), 'DELETE /instance/delete/lp_teste');
  });

  it('se nem apagar funciona, o erro diz o motivo', async () => {
    evo = { logoutFails: 99, state: 'open', deleteFails: true };
    const r = await logout();
    assert.equal(r.status, 502);
    assert.match(r.body.error, /não desconectou.*falhou/);
  });
});

describe('Webhook não é trocado pelo sistema rodando no computador', () => {
  it('sistema em localhost e Evolution na internet: "Conectar" não grava o endereço local', async () => {
    evo = { logoutFails: 0, state: 'open' };
    const res = await dono.call('POST', '/api/crm/whatsapp/connect');
    assert.equal(res.status, 200);
    assert.ok(!calls.some((c) => c.startsWith('POST /webhook/set/')), calls.join(', '));
  });
});
