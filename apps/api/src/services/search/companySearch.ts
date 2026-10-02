import { env } from '../../config/env.js';
import { aiService, AIProviderError } from '../ai/index.js';
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
  source: 'maps' | 'web';
}

const TIMEOUT_MS = 30_000;

/** Portais, buscadores e órgãos públicos não são empresas a prospectar. */
const IGNORED_HOSTS =
  /(^|\.)(google\.[a-z.]+|youtube\.com|wikipedia\.org|gov\.br|jus\.br|leg\.br|serasaexperian\.com\.br|cnpj\.[a-z.]+|econodata\.com\.br|casadosdados\.com\.br|solutudo\.com\.br|reclameaqui\.com\.br|linkedin\.com|tiktok\.com|x\.com|twitter\.com|pinterest\.[a-z.]+|olx\.com\.br|mercadolivre\.com\.br|glassdoor\.com\.br|indeed\.com|infojobs\.com\.br|apontador\.com\.br|guiamais\.com\.br|telelistas\.net)$/i;

async function rapid(host: string, path: string): Promise<{ status: number; body: any }> {
  if (!env.rapidApiKey) throw new AppError(503, 'Pesquisa indisponível: configure a variável RAPIDAPI_KEY no servidor.');
  const res = await fetch(`https://${host}${path}`, {
    headers: { 'x-rapidapi-key': env.rapidApiKey, 'x-rapidapi-host': host },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);
  if (!res) throw new AppError(504, 'A pesquisa demorou demais para responder. Tente novamente.');
  return { status: res.status, body: await res.json().catch(() => null) };
}

const notSubscribed = (r: { status: number; body: any }) => r.status === 403 || /not subscribed/i.test(r.body?.message ?? '');

function formatPhone(raw: string | null | undefined): string | null {
  const d = toBrazilE164Digits(raw);
  if (!d) return raw?.trim() || null;
  const local = d.slice(2);
  return local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}

/** "Local Business Data" (fichas do Google Maps com telefone e endereço), se a chave assinar essa API. */
async function searchMaps(query: string, latLng?: { latitude: number; longitude: number }): Promise<FoundCompany[] | null> {
  const near = latLng ? `&lat=${latLng.latitude}&lng=${latLng.longitude}` : '';
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
      source: 'maps',
    }),
  );
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
async function geocode(address: string): Promise<LatLng | null> {
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
    source: 'maps',
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

/**
 * Locais do Google Maps: "Local Business Data" do RapidAPI se a chave assinar essa API; senão, consultas ao
 * Google Maps pelo Gemini em vários pontos ao redor do centro (só locais confirmados pelo Maps), sem repetir.
 * `center` volta na resposta para as próximas páginas ("Buscar mais locais").
 */
export async function searchCompanyPlaces(
  query: string,
  latLng?: LatLng,
  page = 0,
): Promise<{ items: FoundCompany[]; center: LatLng | null; hasMore: boolean }> {
  if (page === 0) {
    const maps = env.rapidApiKey ? await searchMaps(query, latLng).catch(() => null) : null;
    if (maps) return { items: maps.filter((c) => c.name), center: latLng ?? null, hasMore: false };
  }

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

  // Sem localização do navegador: uma consulta pela pesquisa e o centro vem do endereço do primeiro local
  let center = latLng ?? null;
  if (!center) {
    const first = await aiService.searchGooglePlaces(query).catch((err) => {
      throw mapError(err);
    });
    add(first);
    const address = first.find((p) => p.address)?.address;
    center = address ? await geocode(address) : null;
    if (!center) return { items: found, center: null, hasMore: false };
  }

  const results = await pool(searchPoints(center, page), 3, (point) => aiService.searchGooglePlaces(query, point));
  for (const r of results) if (r.status === 'fulfilled') add(r.value);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (!found.length && failures.length) throw mapError(failures[0].reason);
  return { items: found, center, hasMore: page < 3 };
}
