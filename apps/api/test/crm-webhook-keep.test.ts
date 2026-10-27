import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { env } from '../src/config/env.js';
import { saveConfig } from '../src/services/crm/whatsapp.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * A busca de mensagens confere os eventos do webhook da Evolution: só completa o webhook que já aponta
 * para este sistema; um endereço de outro sistema (ex.: fluxo do n8n) nunca é trocado.
 */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;

const webhooks: Record<string, string> = {};
const sets: string[] = [];
const evo = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const instance = req.url!.split('/').pop()!;
    if (req.url!.startsWith('/webhook/find/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ enabled: true, url: webhooks[instance], events: ['MESSAGES_UPSERT'] }));
    }
    if (req.url!.startsWith('/webhook/set/')) sets.push(instance);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ messages: { records: [] } }));
  });
});

before(async () => {
  await resetDb();
  s = await seed();
  await new Promise<void>((r) => evo.listen(0, '127.0.0.1', r));
  const evoUrl = `http://127.0.0.1:${(evo.address() as AddressInfo).port}`;
  await saveConfig(s.orgA, evoUrl, 'chave', 'inst-a');
  await saveConfig(s.orgB, evoUrl, 'chave', 'inst-b');
  webhooks['inst-a'] = 'https://n8n.exemplo.com/webhook-test/abc';
  webhooks['inst-b'] = `${env.appUrl}/api/crm-webhook/${s.orgB}?token=x`;
  ({ base, close } = await startServer());
});
after(async () => {
  await close();
  await new Promise((r) => evo.close(r));
  await closeDb();
});

describe('Webhook da Evolution na busca de mensagens', () => {
  it('webhook de outro sistema (n8n) não é trocado', async () => {
    const a = client(base);
    assert.equal((await a.login('dono-a@teste.dev')).status, 200);
    assert.equal((await a.call('POST', '/api/crm/sync')).status, 200);
    assert.ok(!sets.includes('inst-a'));
  });

  it('webhook deste sistema com evento faltando é completado', async () => {
    const b = client(base);
    assert.equal((await b.login('dono-b@teste.dev')).status, 200);
    assert.equal((await b.call('POST', '/api/crm/sync')).status, 200);
    assert.ok(sets.includes('inst-b'));
  });
});
