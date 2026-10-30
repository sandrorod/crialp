import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getCompanyFull } from '../src/repositories/companies.js';
import { one, query } from '../src/db/pool.js';
import { instagramUsername } from '../src/services/instagram/instagramPhotos.js';
import { ensureInstagramPhotos } from '../src/services/pipeline/generateLanding.js';
import { closeDb, resetDb, seed, startServer } from './helpers.js';

/** Ao gerar a LP: as 6 fotos mais recentes do Instagram da empresa; avaliações do Google em colunas (até 20). */
let base: string;
let close: () => Promise<unknown>;
let s: Awaited<ReturnType<typeof seed>>;
const realFetch = globalThis.fetch;
// JPEG mínimo (assinatura FF D8 FF)
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
let profileReads = 0;
let profileStatus = 200;

// Perfil: 1 vídeo, 1 post fixado antigo e 8 fotos (a mais nova é a "p9")
const node = (id: string, ts: number, video = false) => ({
  node: { is_video: video, display_url: `https://scontent.cdninstagram.com/${id}.jpg`, taken_at_timestamp: ts, accessibility_caption: `Foto ${id}` },
});
const PROFILE = {
  data: {
    user: {
      is_private: false,
      edge_owner_to_timeline_media: {
        edges: [node('fixado', 100), node('video', 1000, true), ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => node(`p${n}`, 900 + n))],
      },
    },
  },
};

before(async () => {
  await resetDb();
  s = await seed();
  ({ base, close } = await startServer());
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    if (u.hostname === 'www.instagram.com') {
      profileReads++;
      return profileStatus === 200 ? Response.json(PROFILE) : new Response('', { status: profileStatus });
    }
    if (u.hostname.endsWith('cdninstagram.com')) return new Response(JPG, { headers: { 'Content-Type': 'image/jpeg' } });
    return realFetch(input, init);
  });
});
after(async () => {
  mock.restoreAll();
  await close();
  await closeDb();
});

describe('Fotos do Instagram ao gerar a LP', () => {
  it('reconhece o usuário no link ou com @', () => {
    assert.equal(instagramUsername('https://www.instagram.com/padaria.boa/?hl=pt'), 'padaria.boa');
    assert.equal(instagramUsername('instagram.com/Padaria_Boa'), 'padaria_boa');
    assert.equal(instagramUsername('@padaria'), 'padaria');
    assert.equal(instagramUsername('https://www.instagram.com/p/abc123/'), null);
    assert.equal(instagramUsername('https://facebook.com/padaria'), null);
  });

  it('Instagram recusando: a geração segue sem fotos e tenta de novo depois', async () => {
    await query(`update companies set instagram = 'https://www.instagram.com/padaria.a/' where id = $1`, [s.a1.companyId]);
    profileStatus = 401;
    const company = (await getCompanyFull(s.orgA, s.a1.companyId))!;
    assert.equal(await ensureInstagramPhotos(s.orgA, company), false);
    const n = await one<{ n: number }>(`select count(*)::int as n from company_images where company_id = $1 and source = 'instagram'`, [s.a1.companyId]);
    assert.equal(n!.n, 0);
    profileStatus = 200;
  });

  it('traz as 6 fotos mais recentes (sem vídeo, fixado antigo fora), copiadas e liberadas, no fim das fotos', async () => {
    const company = (await getCompanyFull(s.orgA, s.a1.companyId))!;
    assert.equal(await ensureInstagramPhotos(s.orgA, company), true);
    const after = (await getCompanyFull(s.orgA, s.a1.companyId))!;
    const ig = after.images.filter((i) => i.source === 'instagram');
    assert.equal(ig.length, 6);
    assert.ok(ig.every((i) => i.usage_allowed && i.type === 'gallery'));
    // Cópia guardada no sistema (o link do Instagram expira)
    assert.ok(ig.every((i) => !i.url.includes('cdninstagram')));
    assert.deepEqual(
      ig.map((i) => i.alt_text),
      ['Foto p9', 'Foto p8', 'Foto p7', 'Foto p6', 'Foto p5', 'Foto p4'],
    );
    assert.deepEqual(after.images.slice(-6), ig);
  });

  it('uma vez só: gerar de novo não busca nem duplica', async () => {
    const reads = profileReads;
    const company = (await getCompanyFull(s.orgA, s.a1.companyId))!;
    assert.equal(await ensureInstagramPhotos(s.orgA, company), false);
    assert.equal(profileReads, reads);
  });
});

describe('Avaliações do Google na LP', () => {
  it('até 20, em colunas (uma abaixo da outra, sem espaço vazio)', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      author: `Cliente ${i}`,
      photo: null,
      text: i % 3 ? 'Ótimo atendimento.' : 'Atendimento excelente, equipe atenciosa e tudo muito bem explicado do começo ao fim. Recomendo a todos!',
      date: null,
      link: null,
    }));
    await query('update companies set google_reviews = $2 where id = $1', [
      s.a1.companyId,
      JSON.stringify({ rating: 4.9, total: 120, url: null, items, fetched_at: new Date().toISOString(), shown: 20, error: null }),
    ]);
    const slug = (await one<{ slug: string }>('select slug from landing_pages where id = $1', [s.a1.lpId]))!.slug;
    const html = await (await realFetch(`${base}/lp/${slug}`)).text();
    assert.match(html, /class="quotes rv-cols"/);
    assert.equal(html.match(/class="quote rv reveal"/g)?.length, 20);
    assert.match(html, /\.quotes\.rv-cols\{display:block;columns:3 300px/);
  });
});
