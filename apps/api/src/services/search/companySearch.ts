import { env } from '../../config/env.js';
import { aiService, AIProviderError } from '../ai/index.js';
import { aiKeyStore } from '../ai/keyStore.js';
import { AppError } from '../../lib/errors.js';
import { toBrazilE164Digits } from '../../lib/phone.js';
import { PHONE_RE } from '../scraper/ScraperService.js';

/** Empresa encontrada na pesquisa (sem nada inventado: só o que a fonte trouxe). */
export interface FoundCompany {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  /** Link usado no "Gerar LP": o site ou, sem site, o perfil no Google Maps */
  url: string | null;
  description: string | null;
  /** Página do local no Google Maps (botão "Ver no Google") */
  google_url: string | null;
  source: 'maps' | 'web';
  /** Fotos do perfil no Google (quando a fonte as traz) */
  photos?: string[];
  /** Código do local no Google (place_id / google_id), para buscar mais fotos na análise */
  place_id?: string | null;
}

const TIMEOUT_MS = 30_000;

/** Portais, buscadores e órgãos públicos não são empresas a prospectar. */
const IGNORED_HOSTS =
  /(^|\.)(google\.[a-z.]+|youtube\.com|wikipedia\.org|gov\.br|jus\.br|leg\.br|serasaexperian\.com\.br|cnpj\.[a-z.]+|econodata\.com\.br|casadosdados\.com\.br|solutudo\.com\.br|reclameaqui\.com\.br|linkedin\.com|tiktok\.com|x\.com|twitter\.com|pinterest\.[a-z.]+|olx\.com\.br|mercadolivre\.com\.br|glassdoor\.com\.br|indeed\.com|infojobs\.com\.br|apontador\.com\.br|guiamais\.com\.br|telelistas\.net)$/i;

const notSubscribed = (r: { status: number; body: any }) => /not subscribed/i.test(r.body?.message ?? '');

/** Resposta do RapidAPI que indica problema da chave (inválida, sem cota): vale tentar a próxima. */
const keyProblem = (r: { status: number; body: any }) =>
  r.status === 401 || r.status === 429 || (r.status === 403 && !/not subscribed/i.test(r.body?.message ?? '')) || /invalid api key|quota|exceeded|rate limit/i.test(r.body?.message ?? '');

/**
 * Chamada ao RapidAPI com rodízio de chaves (as cadastradas em Configurações + RAPIDAPI_KEY):
 * cada chamada começa pela próxima chave; chave inválida ou sem cota passa para a seguinte.
 */
async function rapid(host: string, path: string): Promise<{ status: number; body: any }> {
  const keys = await aiKeyStore.rotation('rapidapi', env.rapidApiKey);
  if (!keys.length) throw new AppError(503, 'Pesquisa indisponível: cadastre uma chave do RapidAPI em Configurações.');
  let last: { status: number; body: any } | null = null;
  for (const key of keys) {
    const res = await fetch(`https://${host}${path}`, {
      headers: { 'x-rapidapi-key': key.key, 'x-rapidapi-host': host },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (!res) throw new AppError(504, 'A pesquisa demorou demais para responder. Tente novamente.');
    const r = { status: res.status, body: await res.json().catch(() => null) };
    // Esta chave não assina esta API: outra chave do rodízio pode assinar
    if (notSubscribed(r)) {
      last ??= r;
      continue;
    }
    if (!keyProblem(r)) {
      await aiKeyStore.recordUse(key.id);
      return r;
    }
    last = r;
    await aiKeyStore.recordError(key.id, `${r.status}: ${r.body?.message ?? 'erro'}`);
  }
  if (last && notSubscribed(last)) return last;
  throw new AppError(503, `Todas as chaves do RapidAPI falharam (${last?.body?.message ?? last?.status}). Verifique as chaves em Configurações.`);
}

/** Valida uma chave do RapidAPI antes de cadastrá-la (aceita chave válida mesmo sem assinatura numa API específica). */
export async function testRapidApiKey(key: string) {
  const res = await fetch('https://google-search74.p.rapidapi.com/?query=teste&limit=1', {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'google-search74.p.rapidapi.com' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res) throw new AppError(504, 'O RapidAPI não respondeu. Tente novamente.');
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  if (res.status === 401 || /invalid api key/i.test(body?.message ?? '')) throw new AppError(400, 'Chave recusada pelo RapidAPI: chave inválida.');
}


function formatPhone(raw: string | null | undefined): string | null {
  const d = toBrazilE164Digits(raw);
  if (!d) return raw?.trim() || null;
  const local = d.slice(2);
  return local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}

/** "Local Business Data" (fichas do Google Maps com telefone e endereço), se a chave assinar essa API. */
async function searchMaps(query: string): Promise<FoundCompany[] | null> {
  const near = '';
  const r = await rapid('local-business-data.p.rapidapi.com', `/search?query=${encodeURIComponent(query)}&limit=20&region=br&language=pt${near}`);
  if (notSubscribed(r)) return null;
  if (r.status !== 200 || !Array.isArray(r.body?.data)) throw new AppError(502, 'A pesquisa de empresas falhou. Tente novamente.');
  return r.body.data.map(
    (b: any): FoundCompany => ({
      name: String(b.name ?? '').trim(),
      phone: formatPhone(b.phone_number),
      website: b.website || null,
      address: b.full_address || b.address || null,
      rating: typeof b.rating === 'number' ? b.rating : null,
      reviews: typeof b.review_count === 'number' ? b.review_count : null,
      url: b.website || b.place_link || null,
      description: b.type || null,
      google_url: b.place_link || null,
      source: 'maps',
      photos: (b.photos_sample ?? []).map((x: any) => x?.photo_url).filter(Boolean).map(largePhoto),
      place_id: b.business_id || b.google_id || b.place_id || null,
    }),
  );
}

/** Foto do Google no maior tamanho útil para a LP (as URLs trazem o tamanho no final: "=w408-h306-k-no"). */
const largePhoto = (u: string) => u.replace(/=[swh]\d[^/]*$/, '') + '=w1600-h1200-k-no';

/**
 * Fotos do Perfil da Empresa no Google, pela "Local Business Data" do RapidAPI.
 * Identifica o local pelo código (place_id / google_id) ou, sem ele, pelo nome + endereço.
 * Devolve `null` quando não há como buscar (sem chave ou chave sem assinatura dessa API).
 */
export async function googlePlacePhotos(p: { businessId?: string | null; query?: string | null }): Promise<string[] | null> {
  if (!(await aiKeyStore.hasAny('rapidapi', env.rapidApiKey))) return null;
  const host = 'local-business-data.p.rapidapi.com';
  let id = p.businessId ?? null;
  let sample: string[] = [];
  if (!id && p.query) {
    const r = await rapid(host, `/search?query=${encodeURIComponent(p.query)}&limit=1&region=br&language=pt`);
    if (notSubscribed(r)) return null;
    const b = r.status === 200 ? r.body?.data?.[0] : null;
    if (!b) return [];
    id = b.business_id || b.google_id || b.place_id || null;
    sample = (b.photos_sample ?? []).map((x: any) => x?.photo_url).filter(Boolean);
  }
  if (!id) return sample.map(largePhoto);
  const r = await rapid(host, `/business-photos?business_id=${encodeURIComponent(id)}&limit=30&region=br`);
  if (notSubscribed(r)) return sample.length ? sample.map(largePhoto) : null;
  const urls: string[] = r.status === 200 && Array.isArray(r.body?.data) ? r.body.data.map((x: any) => x?.photo_url).filter(Boolean) : [];
  return [...new Set([...urls, ...sample].map(largePhoto))];
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nome da empresa a partir do título da página: a parte do título que mais combina com o domínio. */
function nameFromTitle(title: string, host: string): string {
  const clean = title.replace(/\s*[-|–—•]\s*(Instagram|Facebook|Home|Início|Página Inicial)\s*$/i, '').replace(/\s*\(@[^)]*\)/, '').trim();
  const parts = clean.split(/\s+[|–—•-]\s+|:\s+/).map((p) => p.trim()).filter((p) => p.length > 1);
  if (parts.length < 2) return clean || host;
  const label = norm(host.replace(/^www\./, '').split('.')[0]);
  const score = (p: string) => norm(p).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && label.includes(w)).reduce((n, w) => n + w.length, 0);
  return parts.reduce((best, p) => (score(p) > score(best) ? p : best), parts[parts.length - 1]);
}

/** Resultados da busca web do Google (título, link, resumo), ou [] se a pesquisa não estiver disponível. */
export async function webResults(query: string, limit = 10): Promise<{ url: string; title: string; description: string }[]> {
  if (!(await aiKeyStore.hasAny('rapidapi', env.rapidApiKey))) return [];
  const r = await rapid('google-search74.p.rapidapi.com', `/?query=${encodeURIComponent(query)}&limit=${limit}&related_keywords=false`).catch(() => null);
  if (!r || r.status !== 200 || !Array.isArray(r.body?.results)) return [];
  return r.body.results.filter((x: any) => typeof x?.url === 'string');
}

export const isIgnoredHost = (host: string) => IGNORED_HOSTS.test(host);

/** Busca web do Google ("Google Search 74"): sites encontrados, um por domínio. */
async function searchWeb(query: string): Promise<FoundCompany[]> {
  const r = await rapid('google-search74.p.rapidapi.com', `/?query=${encodeURIComponent(query)}&limit=30&related_keywords=false`);
  if (notSubscribed(r)) throw new AppError(503, 'A chave do RapidAPI não está assinada em nenhuma API de pesquisa suportada.');
  if (r.status !== 200 || !Array.isArray(r.body?.results)) throw new AppError(502, 'A pesquisa falhou. Tente novamente.');
  const seen = new Set<string>();
  const out: FoundCompany[] = [];
  for (const item of r.body.results) {
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (IGNORED_HOSTS.test(host)) continue;
    // Posts, reels e páginas soltas de redes sociais não são o perfil da empresa
    if (/(^|\.)(instagram|facebook)\.com$/.test(host) && /^\/(p|reels?|explore|stories|tv|watch|events|groups|share|photo|story\.php|permalink\.php)(\/|$)/i.test(url.pathname)) continue;
    // Instagram/Facebook: cada perfil é uma empresa; nos demais, uma empresa por domínio
    const key = /(^|\.)(instagram|facebook)\.com$/.test(host) ? url.pathname.split('/')[1]?.toLowerCase() ?? host : host.replace(/^www\./, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const description: string = item.description ?? '';
    const phone = description.match(PHONE_RE)?.find((m) => toBrazilE164Digits(m)) ?? null;
    const site = /(^|\.)(instagram|facebook)\.com$/.test(host) ? url.toString() : url.origin;
    out.push({
      name: nameFromTitle(item.title ?? '', host),
      phone: formatPhone(phone),
      website: site,
      address: null,
      rating: null,
      reviews: null,
      url: url.toString(),
      description: description || null,
      google_url: null,
      source: 'web',
    });
  }
  return out;
}

/** Sites encontrados na busca do Google. */
export async function searchCompanySites(query: string): Promise<FoundCompany[]> {
  return searchWeb(query);
}

type LatLng = { latitude: number; longitude: number };

/** Coordenadas de um endereço (OpenStreetMap), para centrar a busca quando o navegador não enviou a localização. */
export async function geocode(address: string): Promise<LatLng | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`, {
    headers: { 'User-Agent': 'crialp/1.0 (gerador de landing pages)', 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { lat: string; lon: string }[] | null;
  const hit = data?.[0];
  return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon) } : null;
}

/**
 * Pontos consultados numa página da busca: a página 0 é o centro mais 6 pontos a ~3 km; cada página
 * seguinte é um anel mais largo (+3 km), com mais pontos. Cada consulta ao Maps traz os locais mais próximos do ponto.
 */
function searchPoints(center: LatLng, page: number): LatLng[] {
  const radiusKm = 3 * (page + 1);
  const count = Math.min(6 * (page + 1), 12);
  const ring = Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count + (page % 2 ? Math.PI / count : 0);
    const dLat = (radiusKm / 111) * Math.cos(angle);
    const dLng = (radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180))) * Math.sin(angle);
    return { latitude: +(center.latitude + dLat).toFixed(5), longitude: +(center.longitude + dLng).toFixed(5) };
  });
  return page === 0 ? [center, ...ring] : ring;
}

function toFound(p: Awaited<ReturnType<typeof aiService.searchGooglePlaces>>[number]): FoundCompany {
  return {
    name: p.name,
    phone: formatPhone(p.phone),
    website: p.website && /^https?:\/\//i.test(p.website) ? p.website : p.website ? `https://${p.website}` : null,
    address: p.address,
    rating: p.rating,
    reviews: p.reviews,
    // Gerar LP: link do Maps com nome e endereço (a análise lê o perfil e, se houver, o site também)
    url:
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}` +
      (p.placeId ? `&query_place_id=${encodeURIComponent(p.placeId)}` : ''),
    description: null,
    google_url: p.mapsUri,
    source: 'maps',
    place_id: p.placeId ? p.placeId.replace(/^places\//, '') : null,
  };
}

const mapError = (err: unknown) => {
  // Cota do Gemini, chave inválida etc.: mensagem clara em vez de "erro interno"
  if (err instanceof AIProviderError) return new AppError(err.retryable ? 503 : 502, err.userMessage ?? 'Não foi possível consultar o Google Maps. Tente novamente.');
  return err;
};

/** Executa as tarefas com no máximo `limit` ao mesmo tempo (o Gemini limita pedidos por minuto). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]).then(
          (value) => ({ status: 'fulfilled', value }) as const,
          (reason) => ({ status: 'rejected', reason }) as const,
        );
      }
    }),
  );
  return results;
}

/** Maiores cidades do Brasil (todas as capitais incluídas), em ordem de população: busca no país todo. */
const BRAZIL_CITIES: [string, number, number][] = [
  ['São Paulo - SP', -23.55, -46.63], ['Rio de Janeiro - RJ', -22.91, -43.17], ['Brasília - DF', -15.79, -47.88],
  ['Salvador - BA', -12.97, -38.5], ['Fortaleza - CE', -3.73, -38.52], ['Belo Horizonte - MG', -19.92, -43.94],
  ['Manaus - AM', -3.12, -60.02], ['Curitiba - PR', -25.43, -49.27], ['Recife - PE', -8.05, -34.88],
  ['Goiânia - GO', -16.69, -49.26], ['Porto Alegre - RS', -30.03, -51.23], ['Belém - PA', -1.46, -48.49],
  ['Guarulhos - SP', -23.45, -46.53], ['Campinas - SP', -22.91, -47.06], ['São Luís - MA', -2.53, -44.3],
  ['Maceió - AL', -9.67, -35.74], ['Campo Grande - MS', -20.47, -54.62], ['Natal - RN', -5.79, -35.21],
  ['Teresina - PI', -5.09, -42.8], ['João Pessoa - PB', -7.12, -34.86], ['Ribeirão Preto - SP', -21.18, -47.81],
  ['Uberlândia - MG', -18.92, -48.28], ['Sorocaba - SP', -23.5, -47.46], ['Cuiabá - MT', -15.6, -56.1],
  ['Aracaju - SE', -10.91, -37.07], ['Joinville - SC', -26.3, -48.85], ['Londrina - PR', -23.31, -51.16],
  ['Juiz de Fora - MG', -21.76, -43.35], ['Florianópolis - SC', -27.59, -48.55], ['Santos - SP', -23.96, -46.33],
  ['São José dos Campos - SP', -23.18, -45.88], ['Vitória - ES', -20.32, -40.34], ['Porto Velho - RO', -8.76, -63.9],
  ['Feira de Santana - BA', -12.27, -38.97], ['São José do Rio Preto - SP', -20.81, -49.38], ['Maringá - PR', -23.42, -51.94],
  ['Caxias do Sul - RS', -29.17, -51.18], ['Campina Grande - PB', -7.23, -35.88], ['Macapá - AP', 0.03, -51.07],
  ['Boa Vista - RR', 2.82, -60.67], ['Rio Branco - AC', -9.97, -67.81], ['Palmas - TO', -10.18, -48.33],
];
const CITIES_PER_PAGE = 7;
export const MAX_SEARCH_PAGE = Math.ceil(BRAZIL_CITIES.length / CITIES_PER_PAGE) - 1;

const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
/** A pesquisa já diz o lugar? ("… em Campinas", "… Campinas SP", "… São Paulo") */
export function mentionsPlace(query: string) {
  const q = norm(query);
  if (/\sem\s+\S/.test(q) || new RegExp(`(^|[\\s,-])(${UFS})$`, 'i').test(query.trim())) return true;
  return BRAZIL_CITIES.some(([city]) => ` ${q.replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${norm(city.split(' - ')[0]).replace(/[^a-z0-9]+/g, ' ')} `));
}

/**
 * Locais do Google Maps: "Local Business Data" do RapidAPI se a chave assinar essa API; senão, consultas ao
 * Google Maps pelo Gemini em vários pontos ao redor do centro (só locais confirmados pelo Maps), sem repetir.
 * `center` volta na resposta para as próximas páginas ("Buscar mais locais").
 */
export async function searchCompanyPlaces(
  query: string,
  _latLng?: LatLng,
  page = 0,
  savedCenter?: LatLng | null,
): Promise<{ items: FoundCompany[]; center: LatLng | null; hasMore: boolean; warning: string | null }> {
  const found: FoundCompany[] = [];
  const seen = new Set<string>();
  const add = (list: Awaited<ReturnType<typeof aiService.searchGooglePlaces>>) => {
    for (const p of list) {
      const key = p.placeId ?? p.mapsUri;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(toFound(p));
    }
  };
  const located = mentionsPlace(query);

  if (page === 0) {
    // Lista completa do RapidAPI, se a chave assinar a "Local Business Data" (região: Brasil)
    const maps = (await aiKeyStore.hasAny('rapidapi', env.rapidApiKey)) ? await searchMaps(query).catch(() => null) : null;
    if (maps) return { items: maps.filter((c) => c.name), center: null, hasMore: false, warning: null };
  }

  // Com cidade na pesquisa: a cidade e arredores (anéis cada vez maiores em "Buscar mais locais")
  // Sem cidade: o Brasil todo, percorrendo as maiores cidades (7 por página)
  let tasks: { prompt: string; at?: LatLng }[];
  let center: LatLng | null = savedCenter ?? null;
  if (located) {
    if (!center) {
      const first = await aiService.searchGooglePlaces(query).catch((err) => {
        throw mapError(err);
      });
      add(first);
      const address = first.find((p) => p.address)?.address;
      center = address ? await geocode(address) : null;
      if (!center) return { items: found, center: null, hasMore: false, warning: null };
    }
    tasks = searchPoints(center, Math.min(page, 3)).map((at) => ({ prompt: query, at }));
  } else {
    tasks = BRAZIL_CITIES.slice(page * CITIES_PER_PAGE, (page + 1) * CITIES_PER_PAGE).map(([city, lat, lng]) => ({
      prompt: `${query} em ${city}`,
      at: { latitude: lat, longitude: lng },
    }));
  }

  const results = await pool(tasks, 3, (t) => aiService.searchGooglePlaces(t.prompt, t.at));
  for (const r of results) if (r.status === 'fulfilled') add(r.value);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (!found.length && failures.length) throw mapError(failures[0].reason);
  // Consultas que falharam (quase sempre cota do Gemini): o usuário precisa saber que a lista ficou incompleta
  const quota = failures.some((f) => f.reason instanceof AIProviderError && /cota|quota|limite/i.test(`${f.reason.userMessage ?? ''} ${f.reason.message}`));
  const what = located ? 'pontos da região' : 'cidades';
  const warning = failures.length
    ? `Só ${results.length - failures.length} de ${results.length} ${what} foram consultados${quota ? ': a cota diária de consultas ao Google Maps (Gemini 2.5 Flash, 20 por dia por conta no plano gratuito) acabou' : ''}. ` +
      'Para mais locais: cadastre chaves do Gemini de outras contas do Google em Configurações, ative o faturamento no Google AI Studio ou assine a "Local Business Data" no RapidAPI.'
    : null;
  const hasMore = !quota && (located ? page < 3 : page < MAX_SEARCH_PAGE);
  return { items: found, center, hasMore, warning };
}
