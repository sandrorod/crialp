import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Criar empresa sempre confere se ela já existe: mesmo link bloqueia sempre; mesmo telefone/WhatsApp, e-mail,
 * Instagram (ou nome + telefone/CEP) avisam e só criam com "Criar mesmo assim" (allow_duplicate).
 */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

type Dup = { error: string; code: string; details: { id: string; name: string; reason: string; can_override: boolean } };
const create = (body: Record<string, unknown>) => dono.call('POST', '/api/companies', body);

before(async () => {
  await resetDb();
  s = await seed();
  // Padaria A (seed): telefone (11) 3333-4444; aqui ganha e-mail, Instagram e link de origem
  await query(`update companies set email = 'contato@padaria-a.com.br', instagram = 'https://www.instagram.com/padaria.a/', reference_url = $2 where id = $1`, [
    s.a1.companyId,
    'https://dentmap.com.br/dentistas/sao-paulo/padaria-a-abcd1234',
  ]);
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  await close();
  await closeDb();
});

describe('Empresa já cadastrada ao criar', () => {
  for (const [label, body, reason] of [
    ['mesmo telefone com DDD e +55, nome diferente', { name: 'Outro Nome', whatsapp: '+55 11 3333-4444' }, 'telefone'],
    ['mesmo e-mail, nome diferente', { name: 'Outro Nome 2', email: ' Contato@Padaria-A.com.br ' }, 'e-mail'],
    ['mesmo Instagram (como @usuário), nome diferente', { name: 'Outro Nome 3', instagram: 'https://instagram.com/Padaria.A' }, 'Instagram'],
  ] as const) {
    it(`${label}: avisa (409) e cria só com "Criar mesmo assim"`, async () => {
      const r = await create(body);
      assert.equal(r.status, 409);
      const j = (await r.json()) as Dup;
      assert.equal(j.code, 'DUPLICATE_COMPANY');
      assert.deepEqual(j.details, { id: s.a1.companyId, name: 'Padaria A', reason, can_override: true });
      assert.equal((await create({ ...body, allow_duplicate: true })).status, 201);
    });
  }

  it('mesmo link de origem bloqueia sempre, até com "Criar mesmo assim"', async () => {
    const body = { name: 'Qualquer', reference_url: 'https://dentmap.com.br/dentistas/sao-paulo/padaria-a-abcd1234', allow_duplicate: true };
    const r = await create(body);
    assert.equal(r.status, 409);
    assert.equal(((await r.json()) as Dup).details.can_override, false);
  });

  it('mesmo número em outra cidade (outro DDD) não é duplicada', async () => {
    assert.equal((await create({ name: 'Empresa de Campinas', phone: '(19) 3333-4444' })).status, 201);
  });

  it('empresa de outra organização não conta', async () => {
    const b = client(base);
    assert.equal((await b.login('dono-b@teste.dev')).status, 200);
    // E-mail e Instagram só existem na organização A
    assert.equal((await b.call('POST', '/api/companies', { name: 'Outra', email: 'contato@padaria-a.com.br', instagram: '@padaria.a' })).status, 201);
  });
});
