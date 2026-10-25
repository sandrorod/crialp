import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { foundKey, searchCompanies, type SearchCenter } from '../src/services/search/companySearch.js';
import { closeDb, resetDb } from './helpers.js';

/**
 * "Buscar mais" numa pesquisa com cidade: quando a consulta principal do Maps acaba, a busca varre os
 * arredores da cidade e só traz empresas que ainda não apareceram (antes, voltava vazia e o botão sumia).
 * O RapidAPI (Local Business Data) e o OpenStreetMap são simulados.
 */
let mapsCalls: URL[] = [];

const place = (id: string, site: boolean) => ({
  name: `Dentista ${id}`,
  business_id: id,
  place_link: `https://maps.google.com/?cid=${id}`,
  website: site ? `https://${id}.com.br` : null,
  full_address: 'Rua A, 1 - Campinas - SP',
});

function fakeFetch(input: string | URL | Request) {
  const url = new URL(String(input));
  if (url.hostname === 'nominatim.openstreetmap.org') return Response.json([{ lat: '-22.9', lon: '-47.06' }]);
  if (url.hostname === 'local-business-data.p.rapidapi.com') {
    mapsCalls.push(url);
    const lat = url.searchParams.get('lat');
    // Consulta principal: só 30 locais (acabou antes dos 50 da página)
    if (!lat) return Response.json({ data: Array.from({ length: 30 }, (_, i) => place(`base${i}`, i % 2 === 0)) });
    // Cada ponto do mapa: 5 locais já vistos na consulta principal + 10 novos daquele ponto (metade sem site)
    const tag = `${lat}_${url.searchParams.get('lng')}`;
    return Response.json({
      data: [
        ...Array.from({ length: 5 }, (_, i) => place(`base${i}`, i % 2 === 0)),
        ...Array.from({ length: 10 }, (_, i) => place(`${tag}_${i}`, i % 2 === 0)),
      ],
    });
  }
  return new Response('{}', { status: 404 });
}

before(async () => {
  await resetDb();
  env.rapidApiKey = 'chave-de-teste';
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => fakeFetch(input));
});
beforeEach(() => {
  mapsCalls = [];
});
after(async () => {
  mock.restoreAll();
  env.rapidApiKey = undefined;
  await closeDb();
});

describe('Buscar mais com cidade na pesquisa', () => {
  let center: SearchCenter | null = null;
  const known = new Set<string>();

  it('1ª página: os locais da consulta principal; marca o início da varredura', async () => {
    const r = await searchCompanies('dentista em Campinas', 'todos', 0, null);
    assert.equal(r.items.length, 30);
    assert.equal(r.hasMore, true);
    assert.equal(r.center?.step, 0);
    center = r.center;
    for (const c of r.items) known.add(foundKey(c));
  });

  it('"Buscar mais": varre os arredores, sem repetir, e pesquisa sem o nome da cidade', async () => {
    const r = await searchCompanies('dentista em Campinas', 'todos', 1, center, new Set(known));
    assert.ok(r.items.length >= 40, `trouxe ${r.items.length}`);
    assert.ok(
      r.items.every((c) => !known.has(foundKey(c))),
      'repetiu empresa já mostrada',
    );
    assert.equal(new Set(r.items.map(foundKey)).size, r.items.length, 'repetiu empresa na mesma página');
    assert.ok(mapsCalls.every((u) => u.searchParams.get('query') === 'dentista' && u.searchParams.get('lat')));
    assert.equal(r.hasMore, true);
    assert.ok((r.center?.step ?? 0) > 0);
    center = r.center;
    for (const c of r.items) known.add(foundKey(c));
  });

  it('o próximo clique continua de onde parou (outros pontos do mapa)', async () => {
    const before = center?.step ?? 0;
    const r = await searchCompanies('dentista em Campinas', 'todos', 2, center, new Set(known));
    assert.ok(r.items.length >= 40);
    assert.ok(r.items.every((c) => !known.has(foundKey(c))));
    assert.ok((r.center?.step ?? 0) > before);
  });

  it('filtro "sem site": junta empresas sem site suficientes antes de parar', async () => {
    const first = await searchCompanies('dentista em Campinas', 'sem_site', 0, null);
    assert.ok(first.items.every((c) => !c.website));
    const seen = new Set(first.items.map(foundKey));
    const more = await searchCompanies('dentista em Campinas', 'sem_site', 1, first.center, new Set(seen));
    assert.ok(more.items.length >= 40, `trouxe ${more.items.length}`);
    assert.ok(more.items.every((c) => !c.website && !seen.has(foundKey(c))));
    assert.equal(more.hasMore, true);
  });

  it('para quando os pontos do mapa acabam', async () => {
    const r = await searchCompanies('dentista em Campinas', 'todos', 9, { latitude: -22.9, longitude: -47.06, step: 42 }, new Set());
    assert.equal(r.hasMore, false);
    const done = await searchCompanies('dentista em Campinas', 'todos', 10, r.center, new Set());
    assert.equal(done.items.length, 0);
    assert.equal(done.hasMore, false);
  });
});
