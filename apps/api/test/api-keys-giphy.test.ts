import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aiKeyStore } from '../src/services/ai/keyStore.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Chave do GIPHY não sai da lista dela quando é colada em outra lista (o teste do RapidAPI aceita qualquer chave). */
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
const GIPHY_KEY = 'sZWTabcdefghijklmnopqrstuvwxyz12';

const realFetch = globalThis.fetch;
before(async () => {
  await resetDb();
  await seed();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : input.toString());
    if (u.hostname === 'api.giphy.com') return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    // Como o RapidAPI responde a uma chave que não é dele: "não assinado" (403), igual a uma chave válida sem a assinatura
    if (u.hostname.endsWith('rapidapi.com'))
      return new Response(JSON.stringify({ message: 'You are not subscribed to this API.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    return realFetch(input, init);
  }) as typeof fetch;
  let base: string;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await close();
  await closeDb();
});

const keys = async (provider: string) => ((await (await dono.call('GET', `/api/settings/keys/${provider}`)).json()) as { keys: { last4: string }[] }).keys;

describe('Chave do GIPHY', () => {
  it('colada em "Chaves do RapidAPI — Maps" não é movida: continua no GIPHY', async () => {
    assert.equal((await dono.call('POST', '/api/settings/keys/giphy', { key: GIPHY_KEY })).status, 201);
    const r = await dono.call('POST', '/api/settings/keys/rapidapi', { key: GIPHY_KEY });
    assert.equal(r.status, 409);
    assert.match(((await r.json()) as { error: string }).error, /GIPHY/);
    assert.deepEqual(
      (await keys('giphy')).map((k) => k.last4),
      ['yz12'],
    );
    assert.deepEqual(await keys('rapidapi'), []);
  });

  it('chave do GIPHY que já tinha ido para o RapidAPI volta ao ser cadastrada de novo no GIPHY', async () => {
    const other = 'kQ9xabcdefghijklmnopqrstuvwxyz98';
    await aiKeyStore.add({ key: other, label: 'GIPHY 2' }, 'rapidapi');
    const r = await dono.call('POST', '/api/settings/keys/giphy', { key: other });
    assert.equal(r.status, 201);
    assert.equal(((await r.json()) as { moved_from?: string }).moved_from, 'Chaves do RapidAPI — Maps');
    assert.deepEqual((await keys('giphy')).map((k) => k.last4).sort(), ['yz12', 'yz98']);
    assert.deepEqual(await keys('rapidapi'), []);
  });
});
