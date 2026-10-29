import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one, query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Pesquisa do WhatsApp do CRM: pelo texto das mensagens, pelo número e pelo nome do contato. */
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
let maria: string;
let outra: string;

const found = async (search: string) =>
  ((await (await dono.call('GET', `/api/crm/conversations?search=${encodeURIComponent(search)}`)).json()) as { id: string }[]).map((c) => c.id);

before(async () => {
  await resetDb();
  const s = await seed();
  // Número do WhatsApp sem o 9 (como a Evolution manda para muitos celulares antigos)
  const contact = (await one<{ id: string }>(
    `insert into lp_crm_contacts (organization_id, company_id, name, whatsapp) values ($1, $2, 'João Gonçalves', '5562991198888') returning id`,
    [s.orgA, s.a1.companyId],
  ))!.id;
  maria = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, push_name, contact_id, last_message_at)
     values ($1, '556291198888', '556291198888@s.whatsapp.net', 'Jota', $2, now()) returning id`,
    [s.orgA, contact],
  ))!.id;
  await query(`insert into lp_crm_messages (conversation_id, direction, type, body) values ($1, 'in', 'text', 'Quero um orçamento de clareamento')`, [maria]);
  outra = (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, push_name, last_message_at)
     values ($1, '5511977776666', '5511977776666@s.whatsapp.net', 'Pedro', now()) returning id`,
    [s.orgA],
  ))!.id;
  let base: string;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Pesquisa do WhatsApp', () => {
  it('pelo texto das mensagens', async () => {
    assert.deepEqual(await found('clareamento'), [maria]);
    assert.deepEqual(await found('orcamento'), [maria]);
  });

  it('pelo nome do contato (com ou sem acento) e pelo nome do WhatsApp', async () => {
    assert.deepEqual(await found('João'), [maria]);
    assert.deepEqual(await found('joao goncalves'), [maria]);
    assert.deepEqual(await found('Jota'), [maria]);
  });

  it('pelo número, com ou sem o 9, com ou sem DDD e formatação', async () => {
    for (const q of ['62 99119-8888', '(62) 9119-8888', '99119-8888', '9119-8888', '99119', '+55 62 99119 8888', '5562991198888', '556291198888'])
      assert.deepEqual(await found(q), [maria], q);
    assert.deepEqual(await found('97777-6666'), [outra]);
    assert.deepEqual(await found('11 97777'), [outra]);
  });
});
