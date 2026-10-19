import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import dnsCb from 'node:dns';
import dns from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { MockAgent } from 'undici';
import { assertPublicHost, isPrivateIp, normalizeInputUrl } from '../src/lib/url.js';
import { fetchPublic, publicOnlyLookup } from '../src/lib/safeFetch.js';
import { isTrustedOrigin, passwordVersion, requireSameOriginWrite, verifySessionToken } from '../src/middleware/auth.js';
import { detectImageType } from '../src/services/storage/StorageService.js';
import { styleText } from '../src/landing/render.js';
import { elementColorsCss, normalizeElementColors } from '../src/landing/elementColors.js';
import { imageSizesCss, normalizeImageSizes } from '../src/landing/imageSize.js';
import { imageStylesCss, normalizeImageStyles } from '../src/landing/imageStyle.js';
import { allowBrowserRequest } from '../src/services/screenshot/ScreenshotService.js';
import { probeImage } from '../src/services/scraper/imageProbe.js';
import { ScraperService } from '../src/services/scraper/ScraperService.js';
import { pool } from '../src/db/pool.js';

const SECRET = process.env.JWT_SECRET!;
after(() => pool.end());

describe('SSRF: endereços bloqueados', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fd00:ec2::254', 'fc00::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a9fe:a9fe', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::',
    '::127.0.0.1', 'ff02::1', 'lixo',
  ];
  for (const ip of blocked) it(`bloqueia ${ip}`, () => assert.equal(isPrivateIp(ip), true));

  const allowed = ['8.8.8.8', '1.1.1.1', '200.147.67.142', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'];
  for (const ip of allowed) it(`permite ${ip}`, () => assert.equal(isPrivateIp(ip), false));

  // A URL normaliza [::ffff:127.0.0.1] para [::ffff:7f00:1]: antes passava pela checagem
  const literals = ['http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://127.1/', 'http://[::1]:8080/', 'http://169.254.169.254/latest/meta-data/'];
  for (const raw of literals) {
    it(`assertPublicHost recusa ${raw}`, async () => {
      await assert.rejects(assertPublicHost(new URL(raw)), (e: any) => e.code === 'BLOCKED_HOST');
    });
  }

  it('recusa localhost e nomes internos', async () => {
    for (const raw of ['http://localhost/', 'http://api.localhost/', 'http://metadata.google.internal/', 'http://impressora.local/']) {
      await assert.rejects(assertPublicHost(new URL(raw)), (e: any) => e.code === 'BLOCKED_HOST');
    }
  });

  it('recusa nome que resolve para IP interno', async () => {
    const m = mock.method(dns, 'lookup', async () => [{ address: '10.1.2.3', family: 4 }]);
    try {
      await assert.rejects(assertPublicHost(new URL('https://interno.exemplo.com/')), (e: any) => e.code === 'BLOCKED_HOST');
    } finally {
      m.mock.restore();
    }
  });

  it('normalizeInputUrl recusa credenciais na URL e protocolos não http', () => {
    assert.throws(() => normalizeInputUrl('https://user:senha@exemplo.com.br'));
    assert.throws(() => normalizeInputUrl('file:///etc/passwd'));
    assert.throws(() => normalizeInputUrl('gopher://exemplo.com/'));
    assert.equal(normalizeInputUrl('exemplo.com.br').toString(), 'https://exemplo.com.br/');
  });

  it('DNS rebinding: a conexão confere o IP de novo no momento de conectar', async () => {
    const m = mock.method(dnsCb, 'lookup', (_h: string, _o: unknown, cb: Function) => cb(null, [{ address: '127.0.0.1', family: 4 }]));
    try {
      const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => publicOnlyLookup('rebind.exemplo.com', {}, (e) => resolve(e)));
      assert.equal(err?.code, 'EBLOCKEDHOST');
    } finally {
      m.mock.restore();
    }
  });

  it('a conexão segue normalmente para IP público', async () => {
    const m = mock.method(dnsCb, 'lookup', (_h: string, _o: unknown, cb: Function) => cb(null, [{ address: '93.184.216.34', family: 4 }]));
    try {
      const addr = await new Promise<unknown>((resolve) => publicOnlyLookup('exemplo.com', {}, (_e, a) => resolve(a)));
      assert.equal(addr, '93.184.216.34');
    } finally {
      m.mock.restore();
    }
  });
});

describe('SSRF: redirecionamentos', () => {
  const publicDns = () =>
    mock.method(dns, 'lookup', async (host: string) => [{ address: host.endsWith('.exemplo.com') ? '93.184.216.34' : '127.0.0.1', family: 4 }]);

  it('bloqueia redirecionamento de site público para a metadata da nuvem', async () => {
    const m = publicDns();
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('https://site.exemplo.com').intercept({ path: '/foto.jpg' }).reply(302, '', { headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    try {
      await assert.rejects(fetchPublic(new URL('https://site.exemplo.com/foto.jpg'), { dispatcher: agent }), (e: any) => e.code === 'BLOCKED_HOST');
    } finally {
      m.mock.restore();
      await agent.close();
    }
  });

  it('bloqueia redirecionamento para localhost e para outro protocolo', async () => {
    const m = publicDns();
    const agent = new MockAgent();
    agent.disableNetConnect();
    const site = agent.get('https://site.exemplo.com');
    site.intercept({ path: '/a' }).reply(301, '', { headers: { location: 'http://localhost:3333/api/health' } });
    site.intercept({ path: '/b' }).reply(301, '', { headers: { location: 'file:///etc/passwd' } });
    try {
      await assert.rejects(fetchPublic(new URL('https://site.exemplo.com/a'), { dispatcher: agent }), (e: any) => e.code === 'BLOCKED_HOST');
      await assert.rejects(fetchPublic(new URL('https://site.exemplo.com/b'), { dispatcher: agent }), (e: any) => e.code === 'BAD_REDIRECT');
    } finally {
      m.mock.restore();
      await agent.close();
    }
  });

  it('limita a quantidade de redirecionamentos', async () => {
    const m = publicDns();
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('https://site.exemplo.com').intercept({ path: '/loop' }).reply(302, '', { headers: { location: '/loop' } }).persist();
    try {
      await assert.rejects(fetchPublic(new URL('https://site.exemplo.com/loop'), { dispatcher: agent, maxRedirects: 3 }), (e: any) => e.code === 'TOO_MANY_REDIRECTS');
    } finally {
      m.mock.restore();
      await agent.close();
    }
  });

  it('site público legítimo com redirecionamento continua funcionando', async () => {
    const m = publicDns();
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get('https://site.exemplo.com').intercept({ path: '/' }).reply(301, '', { headers: { location: 'https://www.exemplo.com/inicio' } });
    agent.get('https://www.exemplo.com').intercept({ path: '/inicio' }).reply(200, '<html><title>Empresa</title></html>', { headers: { 'content-type': 'text/html' } });
    try {
      const { res, url } = await fetchPublic(new URL('https://site.exemplo.com/'), { dispatcher: agent });
      assert.equal(res.status, 200);
      assert.equal(url.toString(), 'https://www.exemplo.com/inicio');
      assert.match(await res.text(), /Empresa/);
    } finally {
      m.mock.restore();
      await agent.close();
    }
  });

  it('coleta de site (ScraperService) recusa endereço interno', async () => {
    await assert.rejects(new ScraperService().scrape(normalizeInputUrl('http://127.0.0.1:5432/')), (e: any) => e.code === 'BLOCKED_HOST');
    // Pelo formulário este endereço já cai em INVALID_URL; direto na coleta, cai na checagem de host
    assert.throws(() => normalizeInputUrl('http://[::ffff:127.0.0.1]/'));
    await assert.rejects(new ScraperService().scrape(new URL('http://[::ffff:127.0.0.1]/')), (e: any) => e.code === 'BLOCKED_HOST');
  });

  it('leitura de imagem (probeImage) não acessa endereço interno', async () => {
    assert.equal(await probeImage('http://169.254.169.254/latest/meta-data/iam'), null);
    assert.equal(await probeImage('http://[::ffff:7f00:1]:3333/uploads/x.png'), null);
  });

  it('navegador da imagem da página só busca endereços públicos ou o próprio sistema', async () => {
    assert.equal(await allowBrowserRequest('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(await allowBrowserRequest('http://127.0.0.1:5432/'), false);
    assert.equal(await allowBrowserRequest('file:///etc/passwd'), false);
    assert.equal(await allowBrowserRequest('data:image/png;base64,AAAA'), true);
    assert.equal(await allowBrowserRequest('http://localhost:5173/uploads/2026/10/a.png'), true); // APP_URL
  });
});

describe('Sessão (JWT)', () => {
  it('aceita token de sessão válido', () => {
    const t = jwt.sign({ sub: 'u1', typ: 'session', pv: 'abc' }, SECRET, { expiresIn: 60 });
    assert.deepEqual(verifySessionToken(t), { sub: 'u1', pv: 'abc' });
  });
  it('aceita token antigo (sem typ/pv) até expirar', () => {
    assert.deepEqual(verifySessionToken(jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: 60 })), { sub: 'u1', pv: undefined });
  });
  it('recusa token expirado', () => {
    assert.equal(verifySessionToken(jwt.sign({ sub: 'u1', typ: 'session', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET)), null);
  });
  it('recusa token sem assinatura (alg none)', () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"u1"}').toString('base64url')}.`;
    assert.equal(verifySessionToken(none), null);
  });
  it('recusa algoritmo diferente de HS256', () => {
    assert.equal(verifySessionToken(jwt.sign({ sub: 'u1' }, SECRET, { algorithm: 'HS512' })), null);
  });
  it('recusa token assinado com outro segredo', () => {
    assert.equal(verifySessionToken(jwt.sign({ sub: 'u1' }, 'outro-segredo-qualquer-com-32-caracteres!!')), null);
  });
  it('recusa o state do login do Google como sessão', () => {
    assert.equal(verifySessionToken(jwt.sign({ sub: 'u1', p: 'gdrive' }, SECRET, { expiresIn: 600 })), null);
    assert.equal(verifySessionToken(jwt.sign({ sub: 'u1', p: 'gdrive', typ: 'gdrive-state' }, SECRET, { expiresIn: 600 })), null);
  });
  it('recusa token malformado', () => {
    for (const t of ['', 'abc', 'a.b.c', jwt.sign({ foo: 1 }, SECRET), jwt.sign('texto', SECRET)]) assert.equal(verifySessionToken(t), null);
  });
  it('impressão da senha muda quando a senha muda', () => {
    assert.notEqual(passwordVersion('$2a$12$hashA'), passwordVersion('$2a$12$hashB'));
    assert.equal(passwordVersion('$2a$12$hashA'), passwordVersion('$2a$12$hashA'));
  });
});

describe('CSRF', () => {
  const run = (method: string, headers: Record<string, string>) =>
    new Promise<any>((resolve) => requireSameOriginWrite({ method, headers } as any, {} as any, (err?: any) => resolve(err ?? null)));

  it('aceita escrita JSON do próprio painel', async () => {
    assert.equal(await run('POST', { 'content-type': 'application/json', origin: 'http://localhost:5173', 'content-length': '2' }), null);
  });
  it('recusa origem externa', async () => {
    const err = await run('POST', { 'content-type': 'application/json', origin: 'https://site-malicioso.com', 'content-length': '2' });
    assert.equal(err?.code, 'CSRF');
  });
  it('recusa Referer externo quando não há Origin', async () => {
    const err = await run('DELETE', { referer: 'https://site-malicioso.com/pagina', 'content-length': '0' });
    assert.equal(err?.code, 'CSRF');
  });
  it('recusa Origin "null" (iframe isolado)', async () => {
    assert.equal((await run('POST', { 'content-type': 'application/json', origin: 'null', 'content-length': '2' }))?.code, 'CSRF');
  });
  it('recusa formulário text/plain e urlencoded', async () => {
    assert.equal((await run('POST', { 'content-type': 'text/plain', origin: 'http://localhost:5173', 'content-length': '5' }))?.code, 'CSRF');
    assert.equal((await run('POST', { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '5' }))?.code, 'CSRF');
  });
  it('não confunde host parecido', () => {
    assert.equal(isTrustedOrigin('https://localhost.site-malicioso.com'), false);
    assert.equal(isTrustedOrigin('https://site-malicioso.com/localhost'), false);
    assert.equal(isTrustedOrigin('http://localhost:5173'), true);
  });
  it('leitura (GET) não é afetada', async () => {
    assert.equal(await run('GET', { origin: 'https://site-malicioso.com' }), null);
  });
});

describe('Uploads: assinatura binária', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  it('reconhece JPG, PNG, WEBP e GIF', () => {
    assert.equal(detectImageType(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'jpg');
    assert.equal(detectImageType(png), 'png');
    assert.equal(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary')), 'webp');
    assert.equal(detectImageType(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00', 'binary')), 'gif');
  });
  it('recusa HTML, SVG, PDF e arquivos curtos disfarçados de imagem', () => {
    assert.equal(detectImageType(Buffer.from('<!doctype html><script>alert(1)</script>')), null);
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), null);
    assert.equal(detectImageType(Buffer.from('%PDF-1.7 0000000000')), null);
    assert.equal(detectImageType(Buffer.from('ffd8ff', 'hex')), null);
  });
});

describe('HTML das páginas: conteúdo malicioso não fecha <style>', () => {
  it('styleText neutraliza </style>', () => {
    const out = styleText('a{color:red}</style><script>alert(1)</script>');
    assert.ok(!out.includes('</style'));
    assert.ok(!out.includes('<script'));
  });
  it('seletores e cores maliciosos do editor são descartados', () => {
    const colors = normalizeElementColors({
      desktop: {
        '</style><script>alert(1)</script>': { text: '#ff0000' },
        'h1': { text: 'red;}</style><script>alert(1)</script>' },
      },
    });
    const css = elementColorsCss(colors);
    assert.ok(!css.includes('<'), css);
  });
  it('URLs de foto maliciosas não escapam da CSS', () => {
    const evil = 'https://x.com/a.png"]{}</style><script>alert(1)</script>';
    const sizes = imageSizesCss(normalizeImageSizes({ desktop: { [evil]: { w: 50 } } }));
    const looks = imageStylesCss(normalizeImageStyles({ [evil]: { r: 10 } }), { [evil]: { x: 10, y: 10 } } as any);
    for (const css of [sizes, looks]) assert.ok(!css.includes('<'), css);
  });
});

describe('Configuração de produção', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envError = (vars: Record<string, string | undefined>) => {
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', '-e', "import('./src/config/env.ts').then(({ env }) => process.stdout.write(JSON.stringify(env.jwtSecretError)))"],
      { cwd: path.resolve(here, '..'), env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL: 'postgres://lp:senha-forte-do-banco@db:5432/lp', ...vars } },
    ).toString();
    return JSON.parse(out) as string | null;
  };
  it('sem JWT_SECRET em produção: falha com mensagem clara', () => assert.match(envError({})!, /JWT_SECRET não configurado/));
  it('JWT_SECRET curto: falha', () => assert.match(envError({ JWT_SECRET: 'curto' })!, /32 caracteres/));
  it('JWT_SECRET de exemplo: falha', () => assert.match(envError({ JWT_SECRET: 'troque-por-um-segredo-longo-e-aleatorio' })!, /exemplo/));
  it('JWT_SECRET igual à senha do banco: falha', () => assert.match(envError({ JWT_SECRET: 'xx-senha-forte-do-banco-xxxxxxxxxxxxxxxx' })!, /senha do banco/));
  it('JWT_SECRET forte: inicia', () => assert.equal(envError({ JWT_SECRET: 'b'.repeat(16) + 'f1e2d3c4b5a69788' + 'c'.repeat(16) }), null));
});
