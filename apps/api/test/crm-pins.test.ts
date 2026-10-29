import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { one } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** Conversas fixadas no topo da lista do WhatsApp: cada usuário fixa as suas. */
let base: string;
let close: () => Promise<unknown>;
let dono: ReturnType<typeof client>;
let admin: ReturnType<typeof client>;
let old: string;
let recent: string;

const conversation = async (orgId: string, phone: string, minutesAgo: number) =>
  (await one<{ id: string }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, last_message_at)
     values ($1, $2, $2 || '@s.whatsapp.net', now() - make_interval(mins => $3)) returning id`,
    [orgId, phone, minutesAgo],
  ))!.id;
const order = async (c: ReturnType<typeof client>) =>
  ((await (await c.call('GET', '/api/crm/conversations')).json()) as { id: string; pinned: boolean }[]).map((x) => [x.id, x.pinned]);

before(async () => {
  await resetDb();
  const s = await seed();
  old = await conversation(s.orgA, '5511911110000', 60);
  recent = await conversation(s.orgA, '5511922220000', 1);
  ({ base, close } = await startServer());
  dono = client(base);
  admin = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
  assert.equal((await admin.login('admin-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Fixar conversa no topo', () => {
  it('a fixada vai para o topo, mesmo com mensagem mais antiga', async () => {
    assert.deepEqual(await order(dono), [
      [recent, false],
      [old, false],
    ]);
    assert.equal((await dono.call('POST', `/api/crm/conversations/${old}/pin`)).status, 200);
    // Fixar de novo não dá erro
    assert.equal((await dono.call('POST', `/api/crm/conversations/${old}/pin`)).status, 200);
    assert.deepEqual(await order(dono), [
      [old, true],
      [recent, false],
    ]);
  });

  it('é de cada usuário: para os outros a lista não muda', async () => {
    assert.deepEqual(await order(admin), [
      [recent, false],
      [old, false],
    ]);
  });

  it('desafixar volta à ordem normal', async () => {
    assert.equal((await dono.call('DELETE', `/api/crm/conversations/${old}/pin`)).status, 200);
    assert.deepEqual(await order(dono), [
      [recent, false],
      [old, false],
    ]);
  });

  it('conversa de outra organização não pode ser fixada', async () => {
    const b = client(base);
    assert.equal((await b.login('dono-b@teste.dev')).status, 200);
    assert.equal((await b.call('POST', `/api/crm/conversations/${old}/pin`)).status, 404);
  });
});
