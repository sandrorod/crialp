import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { one, query } from '../src/db/pool.js';
import { passwordVersion } from '../src/middleware/auth.js';
import { decrypt, encrypt, reencryptWithCurrentSecret } from '../src/services/ai/keyStore.js';
import { webhookToken } from '../src/services/crm/whatsapp.js';
import { client, closeDb, PASSWORD, resetDb, seed, startServer } from './helpers.js';

// Auditoria de 22/10: CRM, webhook do WhatsApp, anexos, limites compartilhados, troca do segredo e RLS
const SECRET = process.env.JWT_SECRET!;
const PREVIOUS = process.env.JWT_SECRET_PREVIOUS!;
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let crmB: { contact: string; stage: string; deal: string; task: string; conv: string; msg: string };
let msgA: string;

before(async () => {
  await resetDb();
  s = await seed();
  ({ base, close } = await startServer());
  // Dados de CRM da organização B
  const contact = (await one<{ id: string }>(`insert into lp_crm_contacts (organization_id, company_id, name) values ($1, $2, 'Contato B') returning id`, [s.orgB, s.b1.companyId]))!.id;
  const stage = (await one<{ id: string }>(`insert into lp_crm_stages (organization_id, name, position) values ($1, 'Etapa B', 1) returning id`, [s.orgB]))!.id;
  const deal = (await one<{ id: string }>(`insert into lp_crm_deals (organization_id, company_id, stage_id, title) values ($1, $2, $3, 'Negócio B') returning id`, [s.orgB, s.b1.companyId, stage]))!.id;
  const task = (await one<{ id: string }>(`insert into lp_crm_tasks (organization_id, title, assignee_id) values ($1, 'Tarefa B', $2) returning id`, [s.orgB, s.ownerB]))!.id;
  const conv = (await one<{ id: string }>(`insert into lp_crm_conversations (organization_id, phone, company_id) values ($1, '5511999990000', $2) returning id`, [s.orgB, s.b1.companyId]))!.id;
  const msg = (await one<{ id: string }>(`insert into lp_crm_messages (conversation_id, direction, type, body, wa_message_id, status) values ($1, 'in', 'document', 'Mensagem B', 'WA-B-1', 'sent') returning id`, [conv]))!.id;
  crmB = { contact, stage, deal, task, conv, msg };
  // Anexo HTML na organização A (como se viesse de um contato pelo WhatsApp)
  const convA = (await one<{ id: string }>(`insert into lp_crm_conversations (organization_id, phone, company_id) values ($1, '5511988880000', $2) returning id`, [s.orgA, s.a1.companyId]))!.id;
  msgA = (await one<{ id: string }>(`insert into lp_crm_messages (conversation_id, direction, type, wa_message_id) values ($1, 'in', 'image', 'WA-A-1') returning id`, [convA]))!.id;
  await query(`insert into lp_crm_media (message_id, mime, data) values ($1, 'text/html', $2)`, [msgA, Buffer.from('<script>alert(1)</script>')]);
});
after(async () => {
  await close();
  await closeDb();
});

const asUser = async (email: string, secret = SECRET) => {
  const u = (await one<{ id: string; password_hash: string }>('select id, password_hash from users where email = $1', [email]))!;
  const c = client(base);
  c.cookie = `lp_session=${jwt.sign({ sub: u.id, typ: 'session', pv: passwordVersion(u.password_hash, secret) }, secret, { expiresIn: 3600, algorithm: 'HS256' })}`;
  return c;
};

describe('Usuário externo, sem login', () => {
  it('rotas protegidas respondem 401 e não vazam dados', async () => {
    const anon = client(base);
    const paths = [
      '/api/auth/me', '/api/landing-pages', '/api/companies', '/api/users', '/api/settings/ai-keys', '/api/settings/atendimento',
      '/api/crm/companies', '/api/crm/conversations', `/api/crm/media/${crmB.msg}`, '/api/crm/whatsapp', '/api/client-levels',
      `/api/landing-pages/${s.a1.lpId}/preview`, `/api/landing-pages/${s.a1.lpId}/export`,
    ];
    for (const p of paths) {
      const res = await anon.call('GET', p);
      assert.equal(res.status, 401, `GET ${p} → ${res.status}`);
      assert.ok(!(await res.text()).includes('Padaria A'), p);
    }
  });
  it('token forjado (alg none, segredo errado) é recusado', async () => {
    const anon = client(base);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: s.ownerA, typ: 'session' })).toString('base64url')}.`;
    for (const t of [none, jwt.sign({ sub: s.ownerA, typ: 'session' }, 'outro-segredo-qualquer-com-32-caracteres!!')]) {
      anon.cookie = `lp_session=${t}`;
      assert.equal((await anon.call('GET', '/api/auth/me')).status, 401);
    }
  });
});

describe('CRM: isolamento entre organizações', () => {
  it('A não lê nem altera contatos, negócios, tarefas, conversas, mensagens e anexos de B', async () => {
    const a = await asUser('dono-a@teste.dev');
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/crm/companies/${s.b1.companyId}`],
      ['GET', `/api/crm/contacts/${crmB.contact}`],
      ['PUT', `/api/crm/contacts/${crmB.contact}`, { company_id: s.a1.companyId, name: 'Roubado' }],
      ['DELETE', `/api/crm/contacts/${crmB.contact}`],
      ['PUT', `/api/crm/stages/${crmB.stage}`, { name: 'x', color: '#000000', kind: 'open' }],
      ['DELETE', `/api/crm/stages/${crmB.stage}`],
      ['PUT', `/api/crm/deals/${crmB.deal}`, { company_id: s.a1.companyId, stage_id: crmB.stage, title: 'x' }],
      ['DELETE', `/api/crm/deals/${crmB.deal}`],
      ['PATCH', `/api/crm/tasks/${crmB.task}/done`, { done: true }],
      ['DELETE', `/api/crm/tasks/${crmB.task}`],
      ['GET', `/api/crm/conversations/${crmB.conv}/messages`],
      ['POST', `/api/crm/conversations/${crmB.conv}/read`],
      ['DELETE', `/api/crm/messages/${crmB.msg}`],
      ['POST', `/api/crm/messages/${crmB.msg}/reaction`, { emoji: '👍' }],
      ['GET', `/api/crm/media/${crmB.msg}`],
    ];
    for (const [method, path, body] of attempts) {
      const res = await a.call(method, path, body);
      assert.ok([400, 404].includes(res.status), `${method} ${path} → ${res.status}`);
      assert.ok(!(await res.text()).includes('Mensagem B'), `${method} ${path}`);
    }
    const still = await one<{ n: number }>(
      `select (select count(*) from lp_crm_contacts where id = $1 and name = 'Contato B')::int
            + (select count(*) from lp_crm_deals where id = $2 and title = 'Negócio B')::int
            + (select count(*) from lp_crm_tasks where id = $3 and not done)::int
            + (select count(*) from lp_crm_messages where id = $4 and hidden_at is null and my_reaction is null)::int as n`,
      [crmB.contact, crmB.deal, crmB.task, crmB.msg],
    );
    assert.equal(still!.n, 4, 'nada de B foi alterado');
  });
});

describe('Webhook do WhatsApp', () => {
  const post = (orgId: string, token: string, body: unknown) =>
    fetch(`${base}/api/crm-webhook/${orgId}?token=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('token errado é recusado', async () => {
    assert.equal((await post(s.orgA, 'x'.repeat(40), { event: 'messages.update', data: [] })).status, 401);
    assert.equal((await post(s.orgA, webhookToken(s.orgB), { event: 'messages.update', data: [] })).status, 401, 'token de outra organização');
  });
  it('com o token da organização A não apaga nem muda mensagens de B', async () => {
    const t = webhookToken(s.orgA);
    assert.equal((await post(s.orgA, t, { event: 'messages.delete', data: { id: 'WA-B-1' } })).status, 200);
    assert.equal((await post(s.orgA, t, { event: 'messages.update', data: [{ keyId: 'WA-B-1', status: 'READ' }] })).status, 200);
    const m = await one<{ revoked_at: string | null; status: string }>('select revoked_at, status from lp_crm_messages where id = $1', [crmB.msg]);
    assert.equal(m!.revoked_at, null);
    assert.equal(m!.status, 'sent');
  });
  it('endereço gerado com o segredo anterior ainda vale durante a troca', async () => {
    assert.equal((await post(s.orgA, webhookToken(s.orgA, PREVIOUS), { event: 'messages.update', data: [] })).status, 200);
  });
});

describe('Anexos do CRM', () => {
  it('arquivo HTML/SVG vindo do WhatsApp baixa como anexo e não executa script', async () => {
    const a = await asUser('dono-a@teste.dev');
    const res = await a.call('GET', `/api/crm/media/${msgA}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment/);
    assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('Limite de tentativas compartilhado', () => {
  it('duas instâncias do servidor somam as tentativas de login do mesmo IP', async () => {
    await query(`delete from lp_rate_limits`);
    const other = await startServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const target = i % 2 ? other.base : base;
        const res = await fetch(`${target}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
          body: JSON.stringify({ email: 'ninguem@teste.dev', password: 'errada' }),
        });
        statuses.push(res.status);
      }
      // Limite de 10 por IP: a 11ª em diante é recusada, mesmo alternando de instância
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
      assert.deepEqual(statuses.slice(10), [429, 429]);
    } finally {
      await other.close();
      await query(`delete from lp_rate_limits`);
    }
  });
});

describe('Troca do JWT_SECRET', () => {
  it('sessão assinada com o segredo anterior continua valendo', async () => {
    const a = await asUser('dono-a@teste.dev', PREVIOUS);
    assert.equal((await a.call('GET', '/api/auth/me')).status, 200);
  });
  it('chaves gravadas com o segredo anterior são regravadas com o novo', async () => {
    const old = (() => {
      const key = crypto.createHash('sha256').update(`lp-ai-keys:${PREVIOUS}`).digest();
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update('chave-secreta-antiga', 'utf8'), c.final()]);
      return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
    })();
    const row = (await one<{ id: string }>(
      `insert into ai_api_keys (provider, key_encrypted, key_hash, last4) values ('gemini', $1, 'hash-teste-rotacao', 'tiga') returning id`,
      [old],
    ))!;
    assert.equal(decrypt(old), 'chave-secreta-antiga', 'abre com o anterior');
    await reencryptWithCurrentSecret();
    const now = (await one<{ key_encrypted: string }>('select key_encrypted from ai_api_keys where id = $1', [row.id]))!.key_encrypted;
    assert.notEqual(now, old);
    assert.equal(decrypt(now), 'chave-secreta-antiga');
    assert.notEqual(encrypt('x'), encrypt('x'), 'IV aleatório');
  });
});

describe('Banco de dados (Supabase)', () => {
  it('todas as tabelas do sistema têm RLS ativa (fora da Data API pública)', async () => {
    const { rows } = await query<{ relname: string }>(
      `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`,
    );
    assert.deepEqual(rows.map((r) => r.relname), [], 'tabelas sem RLS');
  });
});

describe('Login', () => {
  it('senha errada e conta inexistente dão a mesma resposta', async () => {
    await query(`delete from lp_rate_limits`);
    const c = client(base);
    const wrong = await c.login('dono-a@teste.dev', 'senha-errada');
    const missing = await c.login('nao-existe@teste.dev', PASSWORD);
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.deepEqual(await wrong.json(), await missing.json());
    await query(`delete from lp_rate_limits`);
  });
});
