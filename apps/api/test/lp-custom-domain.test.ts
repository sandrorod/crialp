import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { expectedRecords, isApexDomain } from '../src/services/vercelDomains.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Domínio próprio das LPs na Vercel: registro certo (raiz = A com o IP da Vercel; www = CNAME) e cadastro no projeto. */
describe('Registro de DNS a criar', () => {
  it('domínio raiz (inclusive .com.br): registro A com o IP da Vercel', () => {
    for (const d of ['empresa.com.br', 'empresa.com', 'clinica.med.br']) {
      assert.equal(isApexDomain(d), true, d);
      assert.deepEqual(expectedRecords(d), { kind: 'apex', type: 'A', name: '@', value: '76.76.21.21' });
    }
  });
  it('www e subdomínios: CNAME para a Vercel', () => {
    assert.deepEqual(expectedRecords('www.empresa.com.br'), { kind: 'sub', type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' });
    assert.deepEqual(expectedRecords('lp.empresa.com'), { kind: 'sub', type: 'CNAME', name: 'lp', value: 'cname.vercel-dns.com' });
  });
  it('usa os valores recomendados pela Vercel quando ela informa', () => {
    assert.equal(expectedRecords('empresa.com.br', { a: '216.198.79.1' }).value, '216.198.79.1');
  });
});

let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
let s: Awaited<ReturnType<typeof seed>>;
const realFetch = globalThis.fetch;
let vercelCalls: string[] = [];
let misconfigured = true;

before(async () => {
  await resetDb();
  s = await seed();
  let base: string;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.vercel.com') return realFetch(input, init);
    vercelCalls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.searchParams.get('teamId') ? ' (equipe)' : ''}`);
    if (url.pathname.endsWith('/config')) return Response.json({ misconfigured, recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }] });
    return Response.json({ name: 'ok' });
  });
});
beforeEach(() => {
  vercelCalls = [];
  env.vercel.token = 'token-teste';
  env.vercel.teamId = 'team_teste';
});
after(async () => {
  mock.restoreAll();
  env.vercel.token = undefined;
  env.vercel.teamId = undefined;
  await close();
  await closeDb();
});

describe('Domínio próprio com a Vercel', () => {
  it('salvar adiciona o domínio ao projeto e devolve o registro de raiz com o IP', async () => {
    const res = await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/settings`, { custom_domain: 'https://padaria-a.com.br/' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.custom_domain, 'padaria-a.com.br');
    assert.deepEqual(body.domain_record, { kind: 'apex', type: 'A', name: '@', value: '76.76.21.21' });
    assert.equal(body.vercel_domains, true);
    assert.deepEqual(vercelCalls, ['POST /v10/projects/crialp/domains (equipe)']);
  });

  it('trocar o domínio tira o antigo do projeto e adiciona o novo', async () => {
    await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/settings`, { custom_domain: 'www.padaria-a.com.br' });
    assert.deepEqual(vercelCalls, ['DELETE /v9/projects/crialp/domains/padaria-a.com.br (equipe)', 'POST /v10/projects/crialp/domains (equipe)']);
  });

  it('"Verificar DNS" usa a resposta da Vercel (DNS ainda errado → não verificado; certo → verificado)', async () => {
    misconfigured = true;
    let v = (await (await dono.call('POST', `/api/landing-pages/${s.a1.lpId}/domain/verify`)).json()).verification;
    assert.equal(v.ok, false);
    assert.deepEqual(v.expected, { kind: 'sub', type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' });
    misconfigured = false;
    const res = await (await dono.call('POST', `/api/landing-pages/${s.a1.lpId}/domain/verify`)).json();
    assert.equal(res.verification.ok, true);
    assert.equal(res.domain_status, 'verified');
  });

  it('sem token da Vercel: só mostra o registro (e a tela avisa para adicionar o domínio na Vercel)', async () => {
    env.vercel.token = undefined;
    const body = await (await dono.call('PATCH', `/api/landing-pages/${s.a1.lpId}/settings`, { custom_domain: 'padaria-a.com.br' })).json();
    assert.equal(body.vercel_domains, false);
    assert.equal(body.domain_record.value, '76.76.21.21');
    assert.deepEqual(vercelCalls, []);
  });
});
