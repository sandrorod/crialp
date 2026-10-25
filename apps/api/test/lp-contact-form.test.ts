import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { one, query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/**
 * Formulário de contato das LPs: aparece em todas as páginas cuja empresa tem e-mail válido, envia para
 * esse e-mail (Resend simulado) e guarda a mensagem. Sem e-mail, só a prévia do editor mostra a seção, sinalizada.
 */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let slug: string;
let sent: { to: string[]; reply_to?: string; subject: string; text: string }[] = [];
const realFetch = globalThis.fetch;

const page = async () => (await realFetch(`${base}/lp/${slug}`)).text();
const submit = (fields: Record<string, string>, lpId = s.a1.lpId) =>
  realFetch(`${base}/lp/contato/${lpId}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://empresa-cliente.com.br' },
    body: new URLSearchParams(fields).toString(),
  });
const messages = () =>
  query<{ name: string; status: string; sent_to: string | null }>('select name, status, sent_to from lp_contact_messages order by created_at');

before(async () => {
  await resetDb();
  s = await seed();
  slug = (await one<{ slug: string }>('select slug from landing_pages where id = $1', [s.a1.lpId]))!.slug;
  ({ base, close } = await startServer());
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ id: 'email-1' });
    }
    return realFetch(input, init);
  });
});
beforeEach(async () => {
  sent = [];
  env.mail.from = 'CriaLP <nao-responda@crialp.com.br>';
  env.mail.resendApiKey = 're_teste';
  await query('delete from lp_rate_limits');
});
after(async () => {
  mock.restoreAll();
  env.mail.from = undefined;
  env.mail.resendApiKey = undefined;
  await close();
  await closeDb();
});

describe('Formulário de contato nas LPs', () => {
  it('sem e-mail na empresa, a página publicada não mostra o formulário', async () => {
    await query('update companies set email = null where id = $1', [s.a1.companyId]);
    const html = await page();
    assert.doesNotMatch(html, /id="fale-conosco"/);
  });

  it('na prévia do editor, sem e-mail, a seção aparece sinalizada pedindo um e-mail válido', async () => {
    const dono = client(base);
    await dono.login('dono-a@teste.dev');
    const html = await (await dono.call('GET', `/api/landing-pages/${s.a1.lpId}/preview`)).text();
    assert.match(html, /id="fale-conosco"/);
    assert.match(html, /class="lead-warning"/);
    assert.match(html, /cadastre um e-mail válido/);
    assert.doesNotMatch(html, /action="[^"]*\/lp\/contato\//, 'a prévia não pode enviar');
  });

  it('com e-mail válido, toda LP (inclusive as já existentes) mostra o formulário apontando para o sistema', async () => {
    await query('update companies set email = $2 where id = $1', [s.a1.companyId, 'contato@padaria-a.com.br']);
    const res = await realFetch(`${base}/lp/${slug}`);
    const html = await res.text();
    assert.match(html, /id="fale-conosco"/);
    assert.match(html, new RegExp(`action="${env.appUrl}/lp/contato/${s.a1.lpId}"`));
    assert.doesNotMatch(html, /class="lead-warning"/);
    assert.match(res.headers.get('content-security-policy') ?? '', new RegExp(`form-action ${new URL(env.appUrl).origin}`));
  });

  it('envia para o e-mail da empresa, com resposta para quem preencheu, e guarda a mensagem', async () => {
    const res = await submit({ name: 'Maria', email: 'maria@cliente.com', phone: '(11) 98888-7777', message: 'Quero um orçamento <b>já</b>', website: '' });
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location') ?? '', /\?contato=enviado#fale-conosco$/);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ['contato@padaria-a.com.br']);
    assert.equal(sent[0].reply_to, 'maria@cliente.com');
    assert.match(sent[0].text, /Quero um orçamento <b>já<\/b>/);
    const rows = (await messages()).rows;
    assert.deepEqual(rows.at(-1), { name: 'Maria', status: 'sent', sent_to: 'contato@padaria-a.com.br' });
  });

  it('a volta para a página mostra a confirmação', async () => {
    const html = await (await realFetch(`${base}/lp/${slug}?contato=enviado`)).text();
    assert.match(html, /class="lead-status is-ok"/);
    assert.match(html, /Mensagem enviada!/);
  });

  it('campo isca preenchido (robô): responde como enviado, sem enviar nem guardar', async () => {
    const before = (await messages()).rows.length;
    const res = await submit({ name: 'Bot', email: 'bot@spam.com', message: 'oi', website: 'http://spam.example' });
    assert.match(res.headers.get('location') ?? '', /contato=enviado/);
    assert.equal(sent.length, 0);
    assert.equal((await messages()).rows.length, before);
  });

  it('recusa sem nome, sem mensagem, sem e-mail nem telefone, ou com e-mail inválido', async () => {
    for (const f of [
      { name: '', email: 'a@b.com', message: 'oi' },
      { name: 'Ana', email: 'a@b.com', message: '' },
      { name: 'Ana', message: 'oi' },
      { name: 'Ana', email: 'nao-e-email', message: 'oi' },
    ]) {
      const res = await submit(f);
      assert.match(res.headers.get('location') ?? '', /contato=invalido/, JSON.stringify(f));
    }
    assert.equal(sent.length, 0);
  });

  it('sem provedor de e-mail configurado: guarda a mensagem e avisa o visitante do erro', async () => {
    env.mail.resendApiKey = undefined;
    const res = await submit({ name: 'João', phone: '11999990000', message: 'Me liga' });
    assert.match(res.headers.get('location') ?? '', /contato=erro/);
    assert.equal((await messages()).rows.at(-1)?.status, 'not_configured');
  });

  it('limita a 5 envios a cada 10 minutos por IP', async () => {
    for (let i = 0; i < 5; i++) await submit({ name: `P${i}`, phone: '11999990000', message: 'oi' });
    const res = await submit({ name: 'P6', phone: '11999990000', message: 'oi' });
    assert.match(res.headers.get('location') ?? '', /contato=limite/);
  });

  it('LP inativa ou inexistente não recebe mensagens', async () => {
    await query(`update landing_pages set status = 'inativa' where id = $1`, [s.a2.lpId]);
    assert.equal((await submit({ name: 'Ana', phone: '1199999', message: 'oi' }, s.a2.lpId)).status, 404);
    assert.equal((await submit({ name: 'Ana', phone: '1199999', message: 'oi' }, '00000000-0000-0000-0000-000000000000')).status, 404);
  });
});
