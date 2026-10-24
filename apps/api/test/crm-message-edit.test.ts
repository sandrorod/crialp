import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { one } from '../src/db/pool.js';
import { saveConfig, webhookToken } from '../src/services/crm/whatsapp.js';
import { client, closeDb, ORIGIN, resetDb, seed, startServer } from './helpers.js';

let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let donoA: ReturnType<typeof client>;
let donoB: ReturnType<typeof client>;
let conv: string;

// Evolution API falsa: registra as chamadas e responde OK
const calls: { method: string; path: string; body: any }[] = [];
const evo = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    calls.push({ method: req.method!, path: req.url!, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
  });
});

async function message(direction: 'in' | 'out', opts: { type?: string; minutesAgo?: number; wa?: string } = {}) {
  const row = await one<{ id: string }>(
    `insert into lp_crm_messages (conversation_id, direction, type, body, wa_message_id, status, created_at)
     values ($1, $2, $3, 'Texto original', $4, 'sent', now() - make_interval(mins => $5)) returning id`,
    [conv, direction, opts.type ?? 'text', opts.wa ?? `WA-${Math.random().toString(36).slice(2)}`, opts.minutesAgo ?? 1],
  );
  return row!.id;
}

before(async () => {
  await resetDb();
  s = await seed();
  await new Promise<void>((r) => evo.listen(0, '127.0.0.1', r));
  await saveConfig(s.orgA, `http://127.0.0.1:${(evo.address() as AddressInfo).port}`, 'chave-evolution', 'lp-org-a');
  conv = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, company_id) values ($1, '5511977776666', '5511977776666@s.whatsapp.net', $2) returning id`,
    [s.orgA, s.a1.companyId],
  ))!.id;
  ({ base, close } = await startServer());
  donoA = client(base);
  donoB = client(base);
  assert.equal((await donoA.login('dono-a@teste.dev')).status, 200);
  assert.equal((await donoB.login('dono-b@teste.dev')).status, 200);
});
after(async () => {
  evo.close();
  await close();
  await closeDb();
});

const bodyOf = async (id: string) =>
  (await one<{ body: string; edited_at: string | null }>('select body, edited_at from lp_crm_messages where id = $1', [id]))!;

describe('Editar mensagem enviada (PUT /api/crm/messages/:id)', () => {
  it('edita no WhatsApp (Evolution /chat/updateMessage) e marca como editada', async () => {
    const id = await message('out', { wa: 'WA-EDIT-1' });
    calls.length = 0;
    const res = await donoA.call('PUT', `/api/crm/messages/${id}`, { text: 'Texto corrigido' });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/chat/updateMessage/lp-org-a');
    assert.deepEqual(calls[0].body, {
      number: '5511977776666',
      key: { remoteJid: '5511977776666@s.whatsapp.net', fromMe: true, id: 'WA-EDIT-1' },
      text: 'Texto corrigido',
    });
    const row = await bodyOf(id);
    assert.equal(row.body, 'Texto corrigido');
    assert.ok(row.edited_at);
  });

  it('lista de mensagens mostra "editada" e se ainda dá para editar', async () => {
    const list = await (await donoA.call('GET', `/api/crm/conversations/${conv}/messages`)).json();
    const edited = list.find((m: { body: string }) => m.body === 'Texto corrigido');
    assert.ok(edited.edited_at);
    assert.equal(edited.can_edit, true);
  });

  it('não edita depois de 15 minutos, mensagem recebida, mídia nem texto vazio', async () => {
    calls.length = 0;
    const old = await message('out', { minutesAgo: 16 });
    const received = await message('in');
    const image = await message('out', { type: 'image' });
    const recent = await message('out');
    assert.match((await (await donoA.call('PUT', `/api/crm/messages/${old}`, { text: 'x' })).json()).error, /15 minutos/);
    assert.equal((await donoA.call('PUT', `/api/crm/messages/${received}`, { text: 'x' })).status, 400);
    assert.equal((await donoA.call('PUT', `/api/crm/messages/${image}`, { text: 'x' })).status, 400);
    assert.equal((await donoA.call('PUT', `/api/crm/messages/${recent}`, { text: '   ' })).status, 400);
    assert.equal(calls.length, 0, 'nada foi enviado ao WhatsApp');
    assert.equal((await bodyOf(old)).body, 'Texto original');
  });

  it('outra organização não edita', async () => {
    const id = await message('out');
    assert.equal((await donoB.call('PUT', `/api/crm/messages/${id}`, { text: 'invadido' })).status, 404);
    assert.equal((await bodyOf(id)).body, 'Texto original');
  });
});

describe('Edição feita pelo cliente ou pelo celular (webhook)', () => {
  const webhook = (event: string, data: unknown) =>
    fetch(`${base}/api/crm-webhook/${s.orgA}?token=${webhookToken(s.orgA)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ event, data }),
    });

  it('messages.edited troca o texto da mensagem original', async () => {
    const id = await message('in', { wa: 'WA-CLIENTE-1' });
    const res = await webhook('messages.edited', {
      key: { id: 'WA-CLIENTE-1', remoteJid: '5511977776666@s.whatsapp.net', fromMe: false },
      type: 'MESSAGE_EDIT',
      editedMessage: { conversation: 'Na verdade quero 3 unidades' },
    });
    assert.equal(res.status, 200);
    const row = await bodyOf(id);
    assert.equal(row.body, 'Na verdade quero 3 unidades');
    assert.ok(row.edited_at);
    const summary = await one<{ last_message: string }>('select last_message from lp_crm_conversations where id = $1', [conv]);
    assert.equal(summary!.last_message, 'Na verdade quero 3 unidades');
  });

  it('edição com texto de link (extendedTextMessage) e pelo formato MESSAGES_EDITED', async () => {
    const id = await message('out', { wa: 'WA-CELULAR-1' });
    await webhook('MESSAGES_EDITED', {
      key: { id: 'WA-CELULAR-1', fromMe: true },
      type: 14,
      editedMessage: { extendedTextMessage: { text: 'Veja: https://site.com' } },
    });
    assert.equal((await bodyOf(id)).body, 'Veja: https://site.com');
  });

  it('edição de mensagem de outra organização não muda nada', async () => {
    const other = (await one<{ id: string }>(`insert into lp_crm_conversations (organization_id, phone) values ($1, '5511900001111') returning id`, [s.orgB]))!
      .id;
    const id = (await one<{ id: string }>(
      `insert into lp_crm_messages (conversation_id, direction, type, body, wa_message_id, status) values ($1, 'in', 'text', 'Da B', 'WA-B-EDIT', 'sent') returning id`,
      [other],
    ))!.id;
    await webhook('messages.edited', { key: { id: 'WA-B-EDIT' }, type: 'MESSAGE_EDIT', editedMessage: { conversation: 'alterado pela A' } });
    assert.equal((await bodyOf(id)).body, 'Da B');
  });
});

// Garante que a mensagem editada não some quando a mesma mensagem volta pela sincronização
describe('Sincronização', () => {
  it('protocolMessage MESSAGE_EDIT vindo da sincronização também edita', async () => {
    const { ingestEvolutionRecord } = await import('../src/services/crm/whatsapp.js');
    const id = await message('in', { wa: 'WA-SYNC-1' });
    await ingestEvolutionRecord(s.orgA, {
      key: { id: 'WA-PROTO-1', remoteJid: '5511977776666@s.whatsapp.net', fromMe: false },
      message: { protocolMessage: { key: { id: 'WA-SYNC-1' }, type: 'MESSAGE_EDIT', editedMessage: { conversation: 'Editada no histórico' } } },
    });
    assert.equal((await bodyOf(id)).body, 'Editada no histórico');
  });
});
