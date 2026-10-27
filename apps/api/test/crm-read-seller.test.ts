import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one, query } from '../src/db/pool.js';
import { registerMessage } from '../src/services/crm/whatsapp.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Gerência abrindo conversa de cliente com vendedor atribuído não marca como lida; sem vendedor, marca. */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;
let conv: string;

const unread = async () => (await one<{ unread: number }>('select unread from lp_crm_conversations where id = $1', [conv]))!.unread;

before(async () => {
  await resetDb();
  s = await seed();
  conv = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, company_id, unread) values ($1, '5511977776666', '5511977776666@s.whatsapp.net', $2, 3) returning id`,
    [s.orgA, s.a1.companyId],
  ))!.id;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Conversa lida no WhatsApp do CRM', () => {
  it('cliente com vendedor: a gerência abre e continua não lida', async () => {
    await query('update landing_pages set seller_id = $1 where id = $2', [s.sellerA, s.a1.lpId]);
    assert.equal((await dono.call('POST', `/api/crm/conversations/${conv}/read`)).status, 200);
    assert.equal(await unread(), 3);
  });

  it('o vendedor abre e marca como lida', async () => {
    await query(`update companies set prospeccao = 'sim' where id = $1`, [s.a1.companyId]);
    const v = client(base);
    assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
    assert.equal((await v.call('POST', `/api/crm/conversations/${conv}/read`)).status, 200);
    assert.equal(await unread(), 0);
  });

  it('cliente sem vendedor: a gerência abre e marca como lida', async () => {
    await query('update lp_crm_conversations set unread = 2 where id = $1', [conv]);
    await query('update landing_pages set seller_id = null where company_id = $1', [s.a1.companyId]);
    assert.equal((await dono.call('POST', `/api/crm/conversations/${conv}/read`)).status, 200);
    assert.equal(await unread(), 0);
  });

  it('mensagem enviada (n8n, celular ou CRM) não marca a conversa como lida', async () => {
    await query('update lp_crm_conversations set unread = 0 where id = $1', [conv]);
    const msg = (direction: 'in' | 'out', id: string) =>
      registerMessage({
        orgId: s.orgA,
        phone: '5511977776666',
        remoteJid: '5511977776666@s.whatsapp.net',
        pushName: null,
        direction,
        type: 'text',
        body: 'oi',
        waMessageId: id,
      });
    await msg('in', 'WA-IN-1');
    await msg('in', 'WA-IN-2');
    await msg('out', 'WA-OUT-1');
    assert.equal(await unread(), 2);
  });
});
