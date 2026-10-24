import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb, ORIGIN, resetDb, startServer } from './helpers.js';

const DSN = 'https://chave-publica@o123.ingest.sentry.io/4567';
let base: string;
let close: () => Promise<unknown>;
const realFetch = globalThis.fetch;
const forwarded: { url: string; body: string }[] = [];

before(async () => {
  await resetDb();
  ({ base, close } = await startServer());
  // Só as chamadas ao Sentry são interceptadas; as do teste à API seguem normais
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('sentry.io')) {
      forwarded.push({ url, body: String(init?.body) });
      return new Response(null, { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  delete process.env.SENTRY_DSN;
  await close();
  await closeDb();
});

const envelope = (dsn: string) => `${JSON.stringify({ dsn, sent_at: new Date().toISOString() })}\n{"type":"event"}\n{"message":"erro do painel"}`;
const send = (body: string) =>
  realFetch(`${base}/api/monitoring`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: ORIGIN }, body });

describe('Túnel do Sentry (/api/monitoring)', () => {
  it('sem DSN configurado: desligado (404)', async () => {
    delete process.env.SENTRY_DSN;
    assert.equal((await send(envelope(DSN))).status, 404);
  });

  it('repassa o relatório do projeto configurado ao Sentry', async () => {
    process.env.SENTRY_DSN = DSN;
    forwarded.length = 0;
    const res = await send(envelope(DSN));
    assert.equal(res.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].url, 'https://o123.ingest.sentry.io/api/4567/envelope/');
    assert.match(forwarded[0].body, /erro do painel/);
  });

  it('recusa outro projeto ou outro servidor (não vira proxy aberto)', async () => {
    process.env.SENTRY_DSN = DSN;
    forwarded.length = 0;
    assert.equal((await send(envelope('https://chave@o123.ingest.sentry.io/9999'))).status, 403);
    assert.equal((await send(envelope('https://chave@atacante.example/4567'))).status, 403);
    assert.equal(forwarded.length, 0);
  });

  it('relatório malformado: 400', async () => {
    process.env.SENTRY_DSN = DSN;
    assert.equal((await send('isto não é um envelope')).status, 400);
  });

  it('não aceita envio de outro site (Origin diferente)', async () => {
    process.env.SENTRY_DSN = DSN;
    const res = await realFetch(`${base}/api/monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: 'https://atacante.example' },
      body: envelope(DSN),
    });
    assert.equal(res.status, 403);
  });
});
