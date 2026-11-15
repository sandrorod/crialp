import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { one, query } from '../src/db/pool.js';
import { saveConfig, syncRecent } from '../src/services/crm/whatsapp.js';
import { closeDb, resetDb, seed } from './helpers.js';

/**
 * Com o servidor longe do banco, cada consulta custa caro: a sincronização não pode rodar em paralelo
 * (várias telas/abas abertas) nem regravar as mensagens que já estão no banco a cada poucos segundos.
 */
let s: Awaited<ReturnType<typeof seed>>;
let findCalls = 0;
let records: any[] = [];

const rec = (id: string, ts: number, extra: Record<string, unknown> = {}) => ({
  key: { id, remoteJid: '5511999990000@s.whatsapp.net', fromMe: false },
  pushName: 'Cliente',
  messageTimestamp: ts,
  message: { conversation: `mensagem ${id}` },
  ...extra,
});

const evo = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url!.startsWith('/webhook/find/')) return res.end(JSON.stringify({ enabled: true, url: 'https://outro.exemplo.com/hook' }));
    if (req.url!.startsWith('/chat/findMessages/')) {
      findCalls++;
      // Resposta lenta, como uma Evolution longe: a segunda chamada chega enquanto a primeira roda
      return void setTimeout(() => res.end(JSON.stringify({ messages: { records } })), 150);
    }
    res.end('{}');
  });
});

before(async () => {
  await resetDb();
  s = await seed();
  await new Promise<void>((r) => evo.listen(0, '127.0.0.1', r));
  await saveConfig(s.orgA, `http://127.0.0.1:${(evo.address() as AddressInfo).port}`, 'chave', 'inst-a');
});
after(async () => {
  await new Promise((r) => evo.close(r));
  await closeDb();
});

const lastSyncReset = () => new Promise((r) => setTimeout(r, 5_100));

describe('Sincronização das mensagens recentes', () => {
  it('chamadas simultâneas usam a mesma busca na Evolution', async () => {
    records = [rec('A1', 1_700_000_000), rec('A2', 1_700_000_010)];
    const [r1, r2] = await Promise.all([syncRecent(s.orgA), syncRecent(s.orgA)]);
    assert.equal(findCalls, 1);
    assert.equal(r1.added, 2);
    assert.equal(r2.skipped, 'running');
    const n = await one<{ n: number }>(`select count(*)::int n from lp_crm_messages where wa_message_id in ('A1', 'A2')`);
    assert.equal(n?.n, 2);
  });

  it('mensagens já gravadas não são regravadas; só a nova entra e a não lida conta uma vez', async () => {
    await lastSyncReset();
    // Se a A1 fosse regravada, voltaria com este texto
    await query(`update lp_crm_messages set body = 'intocada' where wa_message_id = 'A1'`);
    records = [rec('A1', 1_700_000_000), rec('A2', 1_700_000_010), rec('A3', 1_700_000_020)];
    const r = await syncRecent(s.orgA);
    assert.equal(r.added, 1);
    const a1 = await one<{ body: string }>(`select body from lp_crm_messages where wa_message_id = 'A1'`);
    assert.equal(a1?.body, 'intocada');
    const conv = await one<{ unread: number }>(`select unread from lp_crm_conversations where organization_id = $1`, [s.orgA]);
    assert.equal(conv?.unread, 3);
  });

  it('enviada já gravada ainda recebe o status de entrega melhor', async () => {
    await lastSyncReset();
    const out = {
      key: { id: 'O1', remoteJid: '5511999990000@s.whatsapp.net', fromMe: true },
      messageTimestamp: 1_700_000_030,
      message: { conversation: 'oi' },
    };
    records = [out];
    await syncRecent(s.orgA);
    await lastSyncReset();
    records = [{ ...out, MessageUpdate: [{ status: 'DELIVERY_ACK' }, { status: 'READ' }] }];
    await syncRecent(s.orgA);
    const o1 = await one<{ status: string }>(`select status from lp_crm_messages where wa_message_id = 'O1'`);
    assert.equal(o1?.status, 'read');
  });
});
