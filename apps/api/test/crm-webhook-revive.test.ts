import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { saveConfig, webhookUrl } from '../src/services/crm/whatsapp.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Sem webhook as mensagens recebidas demoram a aparecer: a busca de mensagens religa o webhook deste sistema
 * quando ele está desligado ou aponta para um endereço antigo (outro domínio ou token).
 */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;

const webhooks: Record<string, { enabled: boolean; url: string }> = {};
const sets: Record<string, { enabled: boolean; url: string }> = {};
const evo = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const instance = req.url!.split('/').pop()!;
    if (req.url!.startsWith('/webhook/find/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...webhooks[instance], events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_EDITED', 'CONNECTION_UPDATE'] }));
    }
    if (req.url!.startsWith('/webhook/set/')) sets[instance] = JSON.parse(raw).webhook;
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
  webhooks['inst-a'] = { enabled: false, url: '' };
  webhooks['inst-b'] = { enabled: true, url: `https://dominio-antigo.exemplo.com/api/crm-webhook/${s.orgB}?token=velho` };
  ({ base, close } = await startServer());
});
after(async () => {
  await close();
  await new Promise((r) => evo.close(r));
  await closeDb();
});

describe('Webhook da Evolution religado na busca de mensagens', () => {
  it('webhook desligado é religado com o endereço deste sistema', async () => {
    const a = client(base);
    assert.equal((await a.login('dono-a@teste.dev')).status, 200);
    assert.equal((await a.call('POST', '/api/crm/sync')).status, 200);
    assert.deepEqual([sets['inst-a']?.enabled, sets['inst-a']?.url], [true, webhookUrl(s.orgA)]);
  });

  it('webhook deste sistema com endereço antigo é corrigido', async () => {
    const b = client(base);
    assert.equal((await b.login('dono-b@teste.dev')).status, 200);
    assert.equal((await b.call('POST', '/api/crm/sync')).status, 200);
    assert.equal(sets['inst-b']?.url, webhookUrl(s.orgB));
  });
});
