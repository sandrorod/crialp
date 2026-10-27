import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { client, closeDb, resetDb, seed, startServer } from './helpers.js';

/** DentMap e Doctoralia: listam os perfis de uma página (só ela), sem outras páginas e sem repetir, marcando os já cadastrados. */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
let dono: ReturnType<typeof client>;

const LIST_HTML = `<html><body>
  <a href="/dentistas/sao-paulo/aclimacao">Aclimação</a>
  <a href="/dentistas/sao-paulo?pagina=2">Próxima</a>
  <a href="/dentistas/sao-paulo/dentar-odontologia-kunrlnvg"><span>Ver perfil de</span> <h3>Dentar Odontologia</h3></a>
  <a href="/dentistas/sao-paulo/dentar-odontologia-kunrlnvg"><img src="x.jpg"></a>
  <a href="https://dentmap.com.br/dentistas/sao-paulo/portal-do-sorriso-zkfrxwdi/">Ver perfil de Portal do Sorriso</a>
  <a href="https://outro-site.com.br/dentistas/sao-paulo/fora-abcdefgh">Fora</a>
  <a href="/blog/como-escolher-dentista">Blog</a>
</body></html>`;

const DOCTORALIA_HTML = `<html><body>
  <a href="https://www.doctoralia.com.br/dentista/sao-paulo">Dentistas em São Paulo</a>
  <a href="https://www.doctoralia.com.br/dentista/sao-paulo?page=2">2</a>
  <a href="https://www.doctoralia.com.br/marcia-ferraz/dentista/sao-paulo"><span>Dra. Marcia Ferraz</span></a>
  <a href="https://www.doctoralia.com.br/marcia-ferraz/dentista/sao-paulo#opinioes">32 opiniões</a>
  <a href="https://www.doctoralia.com.br/clinicas/weclinic-odontologia">Weclinic Odontologia</a>
  <a href="https://www.doctoralia.com.br/clinicas/weclinic-odontologia">Dra. Ana Flávia Dentista</a>
  <a href="https://www.doctoralia.com.br/perguntas-respostas/canal/dentista">Perguntas</a>
  <a href="/dentista/sao-paulo/unimed">Unimed</a>
  <a href="https://www.doctoralia.com.br/dentista/sao-paulo/bradesco-saude">Bradesco Saúde</a>
  <a href="/privacidade">Privacidade</a>
</body></html>`;

const realFetch = globalThis.fetch;
before(async () => {
  await resetDb();
  s = await seed();
  // Só a página do DentMap é simulada; o resto (servidor de teste) segue normal
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : input.toString());
    if (u.hostname === 'dentmap.com.br') return new Response(LIST_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
    if (u.hostname === 'www.doctoralia.com.br') return new Response(DOCTORALIA_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
    return realFetch(input, init);
  }) as typeof fetch;
  ({ base, close } = await startServer());
  dono = client(base);
  assert.equal((await dono.login('dono-a@teste.dev')).status, 200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await close();
  await closeDb();
});

describe('DentMap', () => {
  it('lista só os perfis de dentistas da página, com o nome e sem repetir', async () => {
    const r = await dono.call('GET', `/api/dentmap-links?url=${encodeURIComponent('https://dentmap.com.br/dentistas/sao-paulo')}`);
    assert.equal(r.status, 200);
    const { items } = (await r.json()) as { items: { url: string; name: string; existing: unknown }[] };
    assert.deepEqual(
      items.map((i) => [i.url, i.name]),
      [
        ['https://dentmap.com.br/dentistas/sao-paulo/dentar-odontologia-kunrlnvg', 'Dentar Odontologia'],
        ['https://dentmap.com.br/dentistas/sao-paulo/portal-do-sorriso-zkfrxwdi', 'Portal do Sorriso'],
      ],
    );
    assert.ok(items.every((i) => i.existing === null));
  });

  it('marca o dentista já cadastrado (mesmo link)', async () => {
    await query('update companies set reference_url = $1 where id = $2', [
      'https://dentmap.com.br/dentistas/sao-paulo/portal-do-sorriso-zkfrxwdi',
      s.a1.companyId,
    ]);
    const r = await dono.call('GET', `/api/dentmap-links?url=${encodeURIComponent('dentmap.com.br/dentistas/sao-paulo')}`);
    const { items } = (await r.json()) as { items: { url: string; existing: { id: string } | null }[] };
    assert.equal(items.find((i) => i.url.endsWith('zkfrxwdi'))?.existing?.id, s.a1.companyId);
  });

  it('link de outro site é recusado', async () => {
    const r = await dono.call('GET', `/api/dentmap-links?url=${encodeURIComponent('https://outro-site.com.br/dentistas')}`);
    assert.equal(r.status, 400);
  });

  it('vendedor não acessa', async () => {
    const v = client(base);
    assert.equal((await v.login('vendedor-a@teste.dev')).status, 200);
    assert.equal((await v.call('GET', `/api/dentmap-links?url=${encodeURIComponent('https://dentmap.com.br/dentistas/sao-paulo')}`)).status, 403);
  });
});

describe('Doctoralia', () => {
  it('lista profissionais e clínicas da página, com o nome e sem repetir', async () => {
    const r = await dono.call('GET', `/api/doctoralia-links?url=${encodeURIComponent('https://www.doctoralia.com.br/dentista/sao-paulo')}`);
    assert.equal(r.status, 200);
    const { items } = (await r.json()) as { items: { url: string; name: string }[] };
    assert.deepEqual(
      items.map((i) => [i.url, i.name]),
      [
        ['https://www.doctoralia.com.br/marcia-ferraz/dentista/sao-paulo', 'Dra. Marcia Ferraz'],
        ['https://www.doctoralia.com.br/clinicas/weclinic-odontologia', 'Weclinic Odontologia'],
      ],
    );
  });

  it('link de um perfil sozinho vira o único item', async () => {
    const r = await dono.call('GET', `/api/doctoralia-links?url=${encodeURIComponent('doctoralia.com.br/clinicas/weclinic-odontologia/')}`);
    const { items } = (await r.json()) as { items: { url: string }[] };
    assert.deepEqual(
      items.map((i) => i.url),
      ['https://www.doctoralia.com.br/clinicas/weclinic-odontologia'],
    );
  });

  it('link do DentMap na opção do Doctoralia é recusado', async () => {
    const r = await dono.call('GET', `/api/doctoralia-links?url=${encodeURIComponent('https://dentmap.com.br/dentistas/sao-paulo')}`);
    assert.equal(r.status, 400);
  });
});
