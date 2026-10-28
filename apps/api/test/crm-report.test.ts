import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one, query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Relatório do CRM: mensagens enviadas por dia e por vendedor. Pelo CRM conta para quem enviou; pelo n8n/celular
 * (sem remetente) para o vendedor atribuído à empresa; sem empresa/vendedor fica em "Sem vendedor" (null).
 */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

type Report = {
  users: { id: string; name: string }[];
  rows: { day: string; direction: 'in' | 'out'; user_id: string | null; total: number }[];
  clients: { conversation_id: string; user_id: string | null; sent: number; received: number; is_new: boolean }[];
};
let withCompany: string;
let noCompany: string;
let oldClient: string;

async function msg(conv: string, direction: 'in' | 'out', at: string, sentBy: string | null = null) {
  await query(
    `insert into lp_crm_messages (conversation_id, direction, type, body, status, sent_by, created_at) values ($1, $2, 'text', 'oi', 'sent', $3, $4)`,
    [conv, direction, sentBy, at],
  );
}

before(async () => {
  await resetDb();
  s = await seed();
  await query('update landing_pages set seller_id = $1 where id = $2', [s.sellerA, s.a1.lpId]);
  withCompany = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, company_id) values ($1, '5511900000001', '5511900000001@s.whatsapp.net', $2) returning id`,
    [s.orgA, s.a1.companyId],
  ))!.id;
  noCompany = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid) values ($1, '5511900000002', '5511900000002@s.whatsapp.net') returning id`,
    [s.orgA],
  ))!.id;
  // 26/10 (Brasília)
  await msg(withCompany, 'out', '2026-10-26T13:00:00-03:00', s.sellerA); // pelo CRM, vendedor
  await msg(withCompany, 'out', '2026-10-26T14:00:00-03:00', s.ownerA); // pelo CRM, dono
  await msg(withCompany, 'out', '2026-10-26T15:00:00-03:00'); // n8n: vai para o vendedor da empresa
  await msg(withCompany, 'out', '2026-10-26T23:30:00-03:00'); // 02:30 UTC do dia 27, mas ainda 26 em Brasília
  await msg(withCompany, 'in', '2026-10-26T16:00:00-03:00'); // recebida: não conta
  await msg(noCompany, 'out', '2026-10-26T17:00:00-03:00'); // sem empresa: "Sem vendedor"
  // 27/10
  await msg(withCompany, 'out', '2026-10-27T09:00:00-03:00');
  // fora do período
  await msg(withCompany, 'out', '2026-10-20T09:00:00-03:00', s.sellerA);
  // Cliente antigo (primeiro contato em setembro, sem empresa): contatado de novo no período
  oldClient = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid) values ($1, '5511900000003', '5511900000003@s.whatsapp.net') returning id`,
    [s.orgA],
  ))!.id;
  await msg(oldClient, 'in', '2026-09-10T10:00:00-03:00');
  await msg(oldClient, 'out', '2026-10-27T10:00:00-03:00', s.sellerA);
  await msg(oldClient, 'in', '2026-10-27T10:05:00-03:00');
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Relatório de mensagens enviadas por vendedor', () => {
  it('conta por dia (horário de Brasília) e por vendedor, atribuindo n8n/celular ao vendedor da empresa', async () => {
    const r = await dono.call('GET', '/api/crm/report/messages?from=2026-10-26&to=2026-10-27');
    assert.equal(r.status, 200);
    const j = (await r.json()) as Report;
    const sent = Object.fromEntries(j.rows.filter((x) => x.direction === 'out').map((x) => [`${x.day}|${x.user_id ?? 'sem'}`, x.total]));
    assert.deepEqual(sent, {
      [`2026-10-26|${s.sellerA}`]: 3,
      [`2026-10-26|${s.ownerA}`]: 1,
      '2026-10-26|sem': 1,
      [`2026-10-27|${s.sellerA}`]: 2,
    });
    // Recebidas: para o vendedor da empresa; sem empresa, "Sem vendedor"
    const received = Object.fromEntries(j.rows.filter((x) => x.direction === 'in').map((x) => [`${x.day}|${x.user_id ?? 'sem'}`, x.total]));
    assert.deepEqual(received, { [`2026-10-26|${s.sellerA}`]: 1, '2026-10-27|sem': 1 });
    assert.deepEqual(j.users.map((u) => u.id).sort(), [s.ownerA, s.sellerA].sort());
  });

  it('clientes do período: enviadas, recebidas, vendedor e se o contato é novo', async () => {
    const j = (await (await dono.call('GET', '/api/crm/report/messages?from=2026-10-26&to=2026-10-27')).json()) as Report;
    const by = Object.fromEntries(j.clients.map((c) => [c.conversation_id, c]));
    assert.deepEqual(
      { sent: by[withCompany].sent, received: by[withCompany].received, user: by[withCompany].user_id, novo: by[withCompany].is_new },
      { sent: 5, received: 1, user: s.sellerA, novo: false },
    );
    // A conversa com empresa já tinha mensagem em 20/10 (antes do período): não é nova
    assert.deepEqual({ sent: by[noCompany].sent, novo: by[noCompany].is_new, user: by[noCompany].user_id }, { sent: 1, novo: true, user: null });
    assert.deepEqual(
      { sent: by[oldClient].sent, received: by[oldClient].received, novo: by[oldClient].is_new, user: by[oldClient].user_id },
      { sent: 1, received: 1, novo: false, user: s.sellerA },
    );
  });

  it('relatório anual agrupa por mês', async () => {
    const j = (await (await dono.call('GET', '/api/crm/report/messages?from=2026-01-01&to=2026-12-31&group=month')).json()) as Report;
    const sent = j.rows.filter((x) => x.direction === 'out').reduce<Record<string, number>>((acc, x) => ((acc[x.day] = (acc[x.day] ?? 0) + x.total), acc), {});
    assert.deepEqual(sent, { '2026-10': 8 });
    const rec = j.rows.filter((x) => x.direction === 'in').reduce<Record<string, number>>((acc, x) => ((acc[x.day] = (acc[x.day] ?? 0) + x.total), acc), {});
    assert.deepEqual(rec, { '2026-09': 1, '2026-10': 2 });
  });

  it('vendedor não vê o relatório; período acima de 1 ano é recusado', async () => {
    const v = client(base);
    assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
    assert.equal((await v.call('GET', '/api/crm/report/messages?from=2026-10-26&to=2026-10-27')).status, 403);
    assert.equal((await dono.call('GET', '/api/crm/report/messages?from=2025-01-01&to=2026-10-27')).status, 400);
  });
});
