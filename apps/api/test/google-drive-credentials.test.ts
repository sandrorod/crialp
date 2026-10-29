import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one, query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Credencial do Google (Drive) cadastrada em Configurações, no lugar das variáveis da Vercel. */
let base: string;
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
const CLIENT_ID = '123456789-abcdefg.apps.googleusercontent.com';
const SECRET = 'GOCSPX-segredo-de-teste-1234';

type Status = { configured: boolean; connected: boolean; credential: { source: string; client_id: string; secret_last4: string } | null };
const status = async () => (await (await dono.call('GET', '/api/google-drive/status')).json()) as Status;

const realFetch = globalThis.fetch;
before(async () => {
  // Google simulado: troca do código pelo token e o e-mail da conta
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : input.toString());
    if (u.hostname === 'oauth2.googleapis.com')
      return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.hostname === 'www.googleapis.com' && u.pathname.endsWith('/about'))
      return new Response(JSON.stringify({ user: { emailAddress: 'nova@gmail.com' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return realFetch(input, init);
  }) as typeof fetch;
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  await resetDb();
  await seed();
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await close();
  await closeDb();
});

describe('Credencial do Google Drive em Configurações', () => {
  it('sem credencial: não configurado', async () => {
    const s = await status();
    assert.equal(s.configured, false);
    assert.equal(s.credential, null);
  });

  it('recusa ID do cliente fora do formato do Google', async () => {
    const r = await dono.call('PUT', '/api/google-drive/credentials', { client_id: 'qualquer-coisa', client_secret: SECRET });
    assert.equal(r.status, 400);
  });

  it('salva (chave secreta criptografada), passa a valer e desconecta a conta da credencial anterior', async () => {
    await query(`insert into lp_settings (key, value) values ('google_drive_refresh_token', 'x'), ('google_drive_email', 'antiga@gmail.com')`);
    const r = await dono.call('PUT', '/api/google-drive/credentials', { client_id: ` ${CLIENT_ID} `, client_secret: SECRET });
    assert.equal(r.status, 200);
    const s = (await r.json()) as Status;
    assert.equal(s.configured, true);
    assert.equal(s.connected, false);
    assert.deepEqual(s.credential, { source: 'painel', client_id: CLIENT_ID, secret_last4: '1234' });
    // Nunca em texto puro no banco
    const stored = await one<{ value: string }>(`select value from lp_settings where key = 'google_oauth_client_secret'`);
    assert.ok(stored && !stored.value.includes('GOCSPX'));
    // O login do Google usa o ID novo
    const c = await dono.call('GET', '/api/google-drive/connect');
    const location = c.headers.get('location') ?? '';
    assert.match(location, /^https:\/\/accounts\.google\.com\//);
    assert.equal(new URL(location).searchParams.get('client_id'), CLIENT_ID);
  });

  it('volta do Google sem a sessão do painel (outro domínio): conecta pelo state assinado', async () => {
    const c = await dono.call('GET', '/api/google-drive/connect');
    const state = new URL(c.headers.get('location') ?? '').searchParams.get('state') ?? '';
    // Sem cookie, como quando o Google volta para outro endereço do sistema
    const r = await fetch(`${base}/api/google-drive/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location') ?? '', /\/admin\/configuracoes\?drive=ok$/);
    const s = await status();
    assert.equal(s.connected, true);
    assert.equal((s as Status & { email: string }).email, 'nova@gmail.com');
  });

  it('volta do Google com state inválido não conecta', async () => {
    await dono.call('DELETE', '/api/google-drive');
    const r = await fetch(`${base}/api/google-drive/callback?code=abc&state=falso`, { redirect: 'manual' });
    assert.match(r.headers.get('location') ?? '', /drive=erro$/);
    assert.equal((await status()).connected, false);
  });

  it('remover volta às variáveis da Vercel (sem elas, não configurado)', async () => {
    assert.equal((await dono.call('DELETE', '/api/google-drive/credentials')).status, 200);
    assert.equal((await status()).credential, null);
  });

  it('vendedor não acessa', async () => {
    const v = client(base);
    assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
    assert.equal((await v.call('PUT', '/api/google-drive/credentials', { client_id: CLIENT_ID, client_secret: SECRET })).status, 403);
  });
});
