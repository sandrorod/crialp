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

before(async () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  await resetDb();
  await seed();
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
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
