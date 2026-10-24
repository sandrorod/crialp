import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { one, query } from '../src/db/pool.js';
import { passwordVersion } from '../src/middleware/auth.js';
import { client, closeDb, content, ORIGIN, PASSWORD, resetDb, seed, startServer } from './helpers.js';

const SECRET = process.env.JWT_SECRET!;
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;

before(async () => {
  await resetDb();
  s = await seed();
  ({ base, close } = await startServer());
});
after(async () => {
  await close();
  await closeDb();
});

/**
 * Sessão igual à que o login emite (o login real tem limite de 10 tentativas por IP a cada 15 min,
 * coberto no teste próprio): token assinado com a impressão da senha atual.
 */
const asUser = async (email: string) => {
  const u = (await one<{ id: string; password_hash: string }>('select id, password_hash from users where email = $1', [email]))!;
  const c = client(base);
  c.cookie = `lp_session=${jwt.sign({ sub: u.id, typ: 'session', pv: passwordVersion(u.password_hash) }, SECRET, { expiresIn: 3600, algorithm: 'HS256' })}`;
  assert.equal((await c.call('GET', '/api/auth/me')).status, 200, `sessão de ${email}`);
  return c;
};

const editBody = (headline: string, theme: Record<string, unknown> = {}) => ({
  content: content(headline),
  theme: { preset: 'food', ...theme },
  seo: { seo_title: null, seo_description: null, seo_keywords: [], og_image: null },
});

describe('Login e sessão', () => {
  it('login válido devolve cookie httpOnly, SameSite=Lax e 12 h', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email: 'dono-a@teste.dev', password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('lp_session='))!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Max-Age=43200/);
    const body = await res.json();
    assert.equal(body.user.email, 'dono-a@teste.dev');
    assert.ok(!JSON.stringify(body).includes('password'), 'resposta sem hash de senha');
  });

  it('senha errada e e-mail inexistente dão a mesma resposta (sem enumerar contas)', async () => {
    const c = client(base);
    const wrong = await c.login('dono-a@teste.dev', 'senha-errada');
    const missing = await c.login('ninguem@teste.dev', 'senha-errada');
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.deepEqual(await wrong.json(), await missing.json());
  });

  it('rota privada sem sessão: 401', async () => {
    for (const path of ['/api/auth/me', '/api/companies', '/api/landing-pages', '/api/dashboard', '/api/users']) {
      assert.equal((await fetch(base + path)).status, 401, path);
    }
  });

  it('tokens inválidos, expirados, sem assinatura ou de outro uso: 401', async () => {
    const tokens = [
      'lixo',
      jwt.sign({ sub: s.ownerA, typ: 'session', exp: Math.floor(Date.now() / 1000) - 5 }, SECRET),
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: s.ownerA })).toString('base64url')}.`,
      jwt.sign({ sub: s.ownerA }, 'segredo-errado-com-mais-de-32-caracteres!!'),
      jwt.sign({ sub: s.ownerA, p: 'gdrive' }, SECRET, { expiresIn: 600 }), // state do Google Drive
    ];
    for (const t of tokens) {
      const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `lp_session=${t}` } });
      assert.equal(res.status, 401);
    }
  });

  it('troca de senha encerra as outras sessões e mantém a atual', async () => {
    await query('update users set password_hash = $2 where id = $1', [s.adminA, await bcrypt.hash(PASSWORD, 4)]);
    const other = await asUser('admin-a@teste.dev');
    const me = await asUser('admin-a@teste.dev');
    const res = await me.call('POST', '/api/auth/password', { current_password: PASSWORD, new_password: 'nova-senha-segura-1' });
    assert.equal(res.status, 200);
    assert.equal((await me.call('GET', '/api/auth/me')).status, 200, 'sessão atual continua');
    assert.equal((await other.call('GET', '/api/auth/me')).status, 401, 'sessão antiga revogada');
    await query('update users set password_hash = $2 where id = $1', [s.adminA, await bcrypt.hash(PASSWORD, 4)]);
  });

  it('senha redefinida pelo administrador encerra as sessões do usuário', async () => {
    const seller = await asUser('vendedor-a@teste.dev');
    const owner = await asUser('dono-a@teste.dev');
    assert.equal((await owner.call('PATCH', `/api/users/${s.sellerA}`, { password: 'redefinida-pelo-admin' })).status, 200);
    assert.equal((await seller.call('GET', '/api/auth/me')).status, 401);
    await query('update users set password_hash = $2 where id = $1', [s.sellerA, await bcrypt.hash(PASSWORD, 4)]);
  });

  it('sessão de usuário excluído deixa de valer', async () => {
    const owner = await asUser('dono-a@teste.dev');
    const tmp = await owner.call('POST', '/api/users', { name: 'Temp', email: 'temp-a@teste.dev', password: PASSWORD, role: 'admin' });
    assert.equal(tmp.status, 201);
    const tmpUser = await asUser('temp-a@teste.dev');
    assert.equal((await owner.call('DELETE', `/api/users/${(await tmp.json()).id}`)).status, 200);
    assert.equal((await tmpUser.call('GET', '/api/auth/me')).status, 401);
  });

  it('limite de tentativas de login por IP bloqueia força bruta', async () => {
    const c = client(base);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await c.login('dono-a@teste.dev', `chute-${i}`)).status;
    assert.equal(last, 429);
  });

  it('logout limpa o cookie', async () => {
    const c = await asUser('dono-a@teste.dev');
    const res = await c.call('POST', '/api/auth/logout');
    assert.equal(res.status, 200);
    assert.match(res.headers.getSetCookie().join(';'), /lp_session=;/);
  });
});

describe('Papéis', () => {
  it('vendedor só acessa Vendas', async () => {
    const seller = await asUser('vendedor-a@teste.dev');
    assert.equal((await seller.call('GET', '/api/sales/companies')).status, 200);
    for (const path of ['/api/companies', '/api/landing-pages', '/api/users', `/api/landing-pages/${s.a1.lpId}`]) {
      assert.equal((await seller.call('GET', path)).status, 403, path);
    }
  });

  it('administrador (não dono) não gerencia a conta principal', async () => {
    const admin = await asUser('admin-a@teste.dev');
    assert.equal((await admin.call('PATCH', `/api/users/${s.ownerA}`, { password: 'tentativa-de-troca' })).status, 403);
    assert.equal((await admin.call('DELETE', `/api/users/${s.ownerA}`)).status, 403);
  });

  it('cliente edita só o próprio site e não publica, exclui nem troca domínio', async () => {
    const c = await asUser('cliente-a@teste.dev');
    assert.equal((await c.call('GET', `/api/landing-pages/${s.a1.lpId}`)).status, 200);
    assert.equal((await c.call('PUT', `/api/landing-pages/${s.a1.lpId}/content`, editBody('Editado pelo cliente'))).status, 200);
    assert.equal((await c.call('GET', `/api/landing-pages/${s.a2.lpId}`)).status, 403, 'outro site da mesma organização');
    assert.equal((await c.call('PUT', `/api/landing-pages/${s.a2.lpId}/content`, editBody('x'))).status, 403);
    assert.equal((await c.call('POST', `/api/landing-pages/${s.a1.lpId}/publish`)).status, 403);
    assert.equal((await c.call('DELETE', `/api/landing-pages/${s.a1.lpId}`)).status, 403);
    assert.equal((await c.call('PATCH', `/api/landing-pages/${s.a1.lpId}/settings`, { custom_domain: 'golpe.com.br' })).status, 403);
    assert.equal((await c.call('GET', '/api/users')).status, 403);
    assert.equal((await c.call('GET', `/api/companies/${s.a2.companyId}`)).status, 403);
  });
});

describe('Isolamento entre organizações (A não acessa B)', () => {
  it('leitura, edição, exclusão, publicação, exportação e restauração de B são recusadas', async () => {
    const a = await asUser('dono-a@teste.dev');
    const lp = s.b1.lpId;
    const attempts: [string, string, unknown?][] = [
      ['GET', `/api/landing-pages/${lp}`],
      ['GET', `/api/landing-pages/${lp}/preview`],
      ['POST', `/api/landing-pages/${lp}/preview`, { content: content('x'), theme: { preset: 'food' } }],
      ['GET', `/api/landing-pages/${lp}/export`],
      ['PUT', `/api/landing-pages/${lp}/content`, editBody('invadido')],
      ['POST', `/api/landing-pages/${lp}/versions/1/restore`],
      ['PATCH', `/api/landing-pages/${lp}/status`, { status: 'inativa' }],
      ['POST', `/api/landing-pages/${lp}/publish`],
      ['PATCH', `/api/landing-pages/${lp}/settings`, { slug: 'roubado' }],
      ['POST', `/api/landing-pages/${lp}/domain/verify`],
      ['GET', `/api/landing-pages/${lp}/client-access`],
      ['PUT', `/api/landing-pages/${lp}/client-access`, { email: 'x@teste.dev', password: PASSWORD }],
      ['DELETE', `/api/landing-pages/${lp}`],
      ['GET', `/api/companies/${s.b1.companyId}`],
      ['PUT', `/api/companies/${s.b1.companyId}`, { name: 'Invadida' }],
      ['POST', `/api/companies/${s.b1.companyId}/images`, { images: [{ url: 'https://exemplo.com/a.png' }] }],
      ['DELETE', `/api/companies/${s.b1.companyId}`],
      ['PATCH', `/api/users/${s.ownerB}`, { name: 'Invadido' }],
      ['DELETE', `/api/users/${s.ownerB}`],
    ];
    for (const [method, path, body] of attempts) {
      const res = await a.call(method, path, body);
      assert.equal(res.status, 404, `${method} ${path} → ${res.status}`);
      const text = await res.text();
      assert.ok(!text.includes('Loja B'), `${method} ${path} não revela dados de B`);
    }
    const still = await one<{ title: string; status: string; slug: string }>('select title, status, slug from landing_pages where id = $1', [lp]);
    assert.deepEqual(still, { title: 'Loja B', status: 'ativa', slug: still!.slug });
    assert.notEqual(still!.slug, 'roubado');
    assert.ok(await one('select 1 from companies where id = $1 and name = $2', [s.b1.companyId, 'Loja B']));
  });

  it('listagens trazem só dados da própria organização', async () => {
    const a = await asUser('dono-a@teste.dev');
    const lps = await (await a.call('GET', '/api/landing-pages')).json();
    assert.ok(lps.items.length >= 2 && lps.items.every((i: any) => i.id !== s.b1.lpId));
    const companies = JSON.stringify(await (await a.call('GET', '/api/companies')).json());
    assert.ok(!companies.includes('Loja B'));
    const users = JSON.stringify(await (await a.call('GET', '/api/users')).json());
    assert.ok(!users.includes('dono-b@teste.dev'));
  });

  it('processamentos (jobs) de B não podem ser lidos nem cancelados por A', async () => {
    const jobB = (await one<{ id: string }>(
      `insert into jobs (organization_id, type, input, status) values ($1, 'analyze_url', '{}', 'running') returning id`,
      [s.orgB],
    ))!.id;
    const jobA = (await one<{ id: string }>(
      `insert into jobs (organization_id, type, input, status, step) values ($1, 'analyze_url', '{}', 'running', 2) returning id`,
      [s.orgA],
    ))!.id;
    const a = await asUser('dono-a@teste.dev');
    assert.equal((await a.call('GET', `/api/jobs/${jobB}`)).status, 404);
    assert.equal((await a.call('POST', `/api/jobs/${jobB}/cancel`)).status, 404);
    assert.equal((await one<{ status: string }>('select status from jobs where id = $1', [jobB]))!.status, 'running');
    const own = await (await a.call('GET', `/api/jobs/${jobA}`)).json();
    assert.equal(own.status, 'running');
    assert.equal(own.step, 2);
  });

  it('gerar página com empresa de outra organização: 404 (antes de gastar IA)', async () => {
    const a = await asUser('dono-a@teste.dev');
    const res = await a.call('POST', '/api/generate-landing-page', { companyId: s.b1.companyId });
    assert.ok([404, 503].includes(res.status)); // 503 = IA não configurada no ambiente de teste
    assert.ok(!(await one(`select 1 from jobs where input->>'companyId' = $1`, [s.b1.companyId])));
  });
});

describe('CSRF nas rotas reais', () => {
  it('escrita com origem externa é recusada; do painel passa', async () => {
    const a = await asUser('dono-a@teste.dev');
    const evil = await a.call('PATCH', `/api/landing-pages/${s.a2.lpId}/status`, { status: 'inativa' }, { Origin: 'https://site-malicioso.com' });
    assert.equal(evil.status, 403);
    // Formulário HTML comum (text/plain) de outro site não passa nem com a origem do painel
    const form = await fetch(`${base}/api/landing-pages/${s.a2.lpId}/status`, {
      method: 'PATCH',
      headers: { Origin: ORIGIN, Cookie: a.cookie!, 'Content-Type': 'text/plain' },
      body: '{"status":"inativa"}',
    });
    assert.equal(form.status, 403);
    const ok = await a.call('PATCH', `/api/landing-pages/${s.a2.lpId}/status`, { status: 'ativa' });
    assert.equal(ok.status, 200);
  });
});

describe('Páginas públicas, publicação e domínios', () => {
  it('publicar e despublicar', async () => {
    const a = await asUser('dono-a@teste.dev');
    const lp = await (await a.call('GET', `/api/landing-pages/${s.a2.lpId}`)).json();
    const pub = await fetch(`${base}/lp/${lp.slug}`);
    assert.equal(pub.status, 200);
    assert.match(pub.headers.get('content-security-policy')!, /script-src 'sha256-/);
    assert.equal((await a.call('PATCH', `/api/landing-pages/${s.a2.lpId}/status`, { status: 'inativa' })).status, 200);
    assert.equal((await fetch(`${base}/lp/${lp.slug}`)).status, 404);
    const again = await a.call('POST', `/api/landing-pages/${s.a2.lpId}/publish`);
    assert.equal(again.status, 200);
    assert.equal((await fetch(`${base}/lp/${lp.slug}`)).status, 200);
  });

  it('certificado (Caddy ask) só para domínio verificado de página ativa', async () => {
    const a = await asUser('dono-a@teste.dev');
    const check = (d: string) => fetch(`${base}/api/domains/check?domain=${d}`).then((r) => r.status);
    assert.equal((await a.call('PATCH', `/api/landing-pages/${s.a1.lpId}/settings`, { custom_domain: 'www.padaria-a.com.br' })).status, 200);
    assert.equal(await check('www.padaria-a.com.br'), 404, 'pendente de verificação');
    assert.equal(await check('qualquer-coisa.com'), 404);
    assert.equal(await check(''), 404);
    await query(`update landing_pages set domain_status = 'verified' where id = $1`, [s.a1.lpId]);
    assert.equal(await check('www.padaria-a.com.br'), 200);
    assert.equal(await check('WWW.PADARIA-A.COM.BR'), 200);
    await query(`update landing_pages set status = 'inativa' where id = $1`, [s.a1.lpId]);
    assert.equal(await check('www.padaria-a.com.br'), 404, 'página inativa');
    await query(`update landing_pages set status = 'ativa' where id = $1`, [s.a1.lpId]);
  });

  it('domínio de outra página não pode ser tomado; domínio do sistema é recusado', async () => {
    const b = await asUser('dono-b@teste.dev');
    const steal = await b.call('PATCH', `/api/landing-pages/${s.b1.lpId}/settings`, { custom_domain: 'www.padaria-a.com.br' });
    assert.equal(steal.status, 409);
    assert.equal((await b.call('PATCH', `/api/landing-pages/${s.b1.lpId}/settings`, { custom_domain: 'localhost' })).status, 400);
  });

  it('Host de domínio personalizado só serve a página: sem API, sem painel', async () => {
    // fetch não deixa trocar o Host: usa node:http
    const viaHost = (path: string, host: string, method = 'GET') =>
      new Promise<{ status: number; location?: string }>((resolve, reject) => {
        const u = new URL(base);
        const req = http.request({ host: u.hostname, port: u.port, path, method, headers: { Host: host } }, (res) => {
          res.resume();
          resolve({ status: res.statusCode!, location: res.headers.location });
        });
        req.on('error', reject);
        req.end();
      });
    assert.equal((await viaHost('/', 'www.padaria-a.com.br')).status, 200);
    const api = await viaHost('/api/companies', 'www.padaria-a.com.br');
    assert.equal(api.status, 301);
    assert.equal(api.location, '/');
    assert.equal((await viaHost('/api/auth/login', 'www.padaria-a.com.br', 'POST')).status, 405);
    assert.equal((await viaHost('/admin', 'www.padaria-a.com.br')).status, 301);
    assert.equal((await viaHost('/', 'nao-verificado.com.br')).status, 404);
  });
});

describe('Edição e versões', () => {
  it('editar cria versão e restaurar volta o conteúdo', async () => {
    const a = await asUser('dono-a@teste.dev');
    const id = s.a2.lpId;
    assert.equal((await a.call('PUT', `/api/landing-pages/${id}/content`, editBody('Título novo'))).status, 200);
    const after = await (await a.call('GET', `/api/landing-pages/${id}`)).json();
    assert.equal(after.content.hero.headline, 'Título novo');
    const first = Math.min(...after.versions.map((v: any) => v.version));
    assert.equal((await a.call('POST', `/api/landing-pages/${id}/versions/${first}/restore`)).status, 200);
    const restored = await (await a.call('GET', `/api/landing-pages/${id}`)).json();
    assert.equal(restored.content.hero.headline, 'Atendimento de qualidade');
  });

  it('exportação HTML continua funcionando para a própria página', async () => {
    const a = await asUser('dono-a@teste.dev');
    const res = await a.call('GET', `/api/landing-pages/${s.a2.lpId}/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition')!, /attachment/);
    assert.match(await res.text(), /^<!doctype html>/);
  });
});

describe('Conteúdo malicioso nas páginas', () => {
  it('texto com HTML/script aparece como texto e não executa', async () => {
    const a = await asUser('dono-a@teste.dev');
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const theme = {
      elementColors: { desktop: { '</style><script>alert(3)</script>': { text: '#ff0000' } } },
      imageStyle: { 'https://x.com/a.png"]{}</style><script>alert(4)</script>': { r: 10 } },
      focus: { 'https://x.com/b.png</style><script>alert(5)</script>': { x: 10, y: 10 } },
    };
    const res = await a.call('PUT', `/api/landing-pages/${s.a2.lpId}/content`, {
      ...editBody(evil, theme),
      seo: {
        seo_title: '"><script>alert(6)</script>',
        seo_description: null,
        seo_keywords: ['</title><script>alert(7)</script>'],
        og_image: 'javascript:alert(8)',
      },
    });
    assert.ok([200, 400].includes(res.status), `status ${res.status}`);
    if (res.status === 400) {
      // og_image javascript: é recusado na validação: salva sem ele
      const ok = await a.call('PUT', `/api/landing-pages/${s.a2.lpId}/content`, {
        ...editBody(evil, theme),
        seo: { seo_title: '"><script>alert(6)</script>', seo_description: null, seo_keywords: ['</title><script>alert(7)</script>'], og_image: null },
      });
      assert.equal(ok.status, 200);
    }
    const lp = await (await a.call('GET', `/api/landing-pages/${s.a2.lpId}`)).json();
    for (const html of [await (await fetch(`${base}/lp/${lp.slug}`)).text(), await (await a.call('GET', `/api/landing-pages/${s.a2.lpId}/preview`)).text()]) {
      assert.ok(!/<script>alert/i.test(html), 'nenhum <script> injetado');
      assert.ok(!/<img[^>]+onerror=/i.test(html), 'nenhum atributo de evento injetado');
      assert.ok(!html.includes('javascript:alert'), 'nenhuma URL javascript:');
      assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'texto escapado aparece como texto');
      const executable = (html.match(/<script(?![^>]*type="application\/(?:ld\+)?json")[^>]*>/g) ?? []).length;
      assert.equal(executable, 1, 'só o script de animação (liberado por hash na CSP)');
    }
  });
});

describe('Uploads', () => {
  const png = () => {
    const buf = Buffer.alloc(200);
    Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex').copy(buf);
    return buf;
  };
  const form = (buf: Buffer, name: string, type: string) => {
    const f = new FormData();
    f.append('file', new Blob([buf], { type }), name);
    return f;
  };

  it('sem login: 401', async () => {
    const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Origin: ORIGIN }, body: form(png(), 'a.png', 'image/png') });
    assert.equal(res.status, 401);
  });

  it('PNG válido é aceito e servido sem poder executar', async () => {
    const a = await asUser('dono-a@teste.dev');
    const res = await a.call('POST', '/api/uploads', form(png(), '../../etc/passwd.png', 'image/png'));
    assert.equal(res.status, 201);
    const { url } = await res.json();
    assert.match(url, /^\/uploads\/db\/[0-9a-f-]{36}\.png$/, 'nome gerado pelo servidor, sem o nome enviado');
    const file = await fetch(base + url);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.match(file.headers.get('content-security-policy')!, /sandbox/);
  });

  it('HTML ou SVG disfarçado de imagem é recusado', async () => {
    const a = await asUser('dono-a@teste.dev');
    const html = await a.call('POST', '/api/uploads', form(Buffer.from('<html><script>alert(1)</script></html>'), 'foto.png', 'image/png'));
    assert.equal(html.status, 400);
    const svg = await a.call(
      'POST',
      '/api/uploads',
      form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), 'logo.svg', 'image/svg+xml'),
    );
    assert.equal(svg.status, 400);
  });

  it('arquivo acima de 2 MB é recusado com 413', async () => {
    const a = await asUser('dono-a@teste.dev');
    const big = Buffer.concat([png(), Buffer.alloc(2 * 1024 * 1024)]);
    const res = await a.call('POST', '/api/uploads', form(big, 'grande.png', 'image/png'));
    assert.equal(res.status, 413);
  });

  it('caminho com path traversal não lê arquivos fora da pasta', async () => {
    for (const p of ['/uploads/../package.json', '/uploads/%2e%2e/%2e%2e/package.json', '/uploads/db/..%2f..%2fpackage.json', '/uploads/.env']) {
      const res = await fetch(base + p);
      assert.ok([400, 403, 404].includes(res.status), `${p} → ${res.status}`);
    }
  });
});

describe('Banco de dados', () => {
  it('tabelas expostas pela Data API do Supabase têm RLS ativa (migration 029)', async () => {
    const { rows } = await query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace
        and relname in ('lp_client_levels', 'lp_client_pages', 'schema_migrations')`,
    );
    assert.equal(rows.length, 3);
    for (const r of rows) assert.equal(r.relrowsecurity, true, r.relname);
  });

  it('o app (dono das tabelas) continua lendo e gravando com RLS ativa', async () => {
    const a = await asUser('dono-a@teste.dev');
    const created = await a.call('POST', '/api/client-levels', { name: 'Ouro', price: 99.9 });
    assert.equal(created.status, 201);
    assert.equal((await a.call('PUT', `/api/landing-pages/${s.a2.lpId}/client-access`, { email: 'cliente-novo@teste.dev', password: PASSWORD })).status, 200);
  });
});
