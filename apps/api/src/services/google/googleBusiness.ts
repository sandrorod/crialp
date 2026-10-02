import { AppError } from '../../lib/errors.js';
import { digitsOnly, toBrazilE164Digits } from '../../lib/phone.js';
import { geocode, isIgnoredHost, webResults } from '../search/companySearch.js';
import { aiService, AIProviderError } from '../ai/index.js';
import {
  EMAIL_RE,
  normalizeSocialUrl,
  PHONE_RE,
  socialNetworkOf,
  ZIP_RE,
  type ScrapeResult,
  type ScraperService,
} from '../scraper/ScraperService.js';

/** Links de compartilhamento do Google Maps / Perfil da Empresa no Google. */
const SHORT_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|share\.google)$/i;
const GOOGLE_HOST = /^(www\.|maps\.)?google\.[a-z.]{2,8}$/i;

export function isGoogleBusinessUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.test(host)) return host !== 'goo.gl' || url.pathname.startsWith('/maps');
  return GOOGLE_HOST.test(host) && (host.startsWith('maps.') || /^\/(maps|search)\b/.test(url.pathname));
}

/** Segue o link curto até o endereço do Google (sem sair dos domínios do Google). */
async function resolveShortLink(url: URL): Promise<URL> {
  let current = url;
  if (!SHORT_HOSTS.test(current.hostname)) return current;
  // share.google passa por google.com/share.google?q=… antes de chegar à busca com o nome da empresa
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null);
    const location = res?.headers.get('location');
    if (!location) break;
    const next = new URL(location, current);
    if (!SHORT_HOSTS.test(next.hostname) && !GOOGLE_HOST.test(next.hostname) && !/(^|\.)google\.[a-z.]+$/i.test(next.hostname)) break;
    current = next;
  }
  return current;
}

/** Nome do local e coordenadas tirados do endereço do Google Maps / da busca do Google. */
function parseGoogleUrl(url: URL): { query: string | null; latLng?: { latitude: number; longitude: number } } {
  const decode = (v: string) => decodeURIComponent(v.replace(/\+/g, ' ')).trim();
  const place = /\/maps\/place\/([^/]+)/.exec(url.pathname)?.[1];
  const query = place ? decode(place) : url.searchParams.get('q') ?? url.searchParams.get('query');
  const full = url.toString();
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(full) ?? /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(full);
  return {
    query: query ? decode(query).replace(/\s+/g, ' ') || null : null,
    latLng: at ? { latitude: Number(at[1]), longitude: Number(at[2]) } : undefined,
  };
}

/**
 * Lê o Perfil da Empresa no Google e devolve no mesmo formato da leitura de um site, para seguir
 * pelo mesmo caminho (IA + verificação anti-invenção). Se o perfil tiver um site próprio, ele também
 * é lido e somado. `website` é o site da empresa (ou null).
 */
export async function scrapeGoogleBusiness(input: URL, scraper: ScraperService): Promise<{ scrape: ScrapeResult; website: string | null }> {
  const url = await resolveShortLink(input);
  // Busca do Google com vários resultados (ex.: "manutenção predial"): não diz qual empresa é. O link
  // de uma empresa (botão Compartilhar do painel dela) traz "kgmid"/"ludocid" junto com o nome.
  const isSearch = /^\/search\b/.test(url.pathname);
  const singleBusiness = url.searchParams.has('kgmid') || url.searchParams.has('ludocid');
  if (isSearch && (!singleBusiness || /^(local|lcl)$/.test(url.searchParams.get('udm') ?? url.searchParams.get('tbm') ?? ''))) {
    throw new AppError(
      422,
      'Este é o link de uma lista de resultados do Google, não de uma empresa. Clique na empresa desejada, use o botão "Compartilhar" do painel dela e cole o link copiado (share.google/… ou maps.app.goo.gl/…).',
      'GOOGLE_SEARCH_LIST',
    );
  }
  const { query, latLng } = parseGoogleUrl(url);
  if (!query) {
    throw new AppError(422, 'Não identifiquei a empresa neste link do Google. No Google Maps, abra o perfil da empresa e use "Compartilhar" → "Copiar link".', 'GOOGLE_LINK');
  }
  const info = await aiService.describeGooglePlace(query, latLng).catch((err) => {
    if (err instanceof AIProviderError) throw new AppError(err.retryable ? 503 : 502, err.userMessage ?? 'Não foi possível consultar o Google Maps. Tente novamente.');
    throw err;
  });
  if (!info) throw new AppError(422, `Não consegui ler os dados de "${query}" no Google Maps (empresas que atendem no local do cliente, sem endereço público, às vezes não aparecem). Use o site da empresa ou preencha os dados manualmente.`, 'GOOGLE_NOT_FOUND');
  return fromPlaceInfo(input, info, scraper);
}

/** Local escolhido em "Buscar empresas": os dados do Maps já vieram na pesquisa, sem consultar de novo. */
export interface PlaceListing {
  name: string;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
}

export async function scrapeGooglePlaceListing(input: URL, place: PlaceListing, scraper: ScraperService) {
  const lines = [
    `Nome: ${place.name}`,
    place.address && `Endereço completo: ${place.address}`,
    place.phone && `Telefone: ${place.phone}`,
    place.website && `Site: ${place.website}`,
    place.rating != null && `Nota: ${place.rating}${place.reviews != null ? ` (${place.reviews} avaliações no Google)` : ''}`,
  ].filter(Boolean);
  // Perfil completo no Maps (horário, descrição, serviços), localizado pelo endereço; sem ele, segue com os dados da lista
  const near = place.address ? await geocode(place.address) : null;
  const full = await aiService
    .describeGooglePlace([place.name, place.address].filter(Boolean).join(', '), near ?? undefined)
    .catch((err) => {
      console.warn('[google] perfil completo indisponível:', err instanceof Error ? err.message : err);
      return null;
    });
  const text = full ? `${full.text}\n${lines.join('\n')}` : lines.join('\n');
  return fromPlaceInfo(input, { text, mapsUri: input.toString(), title: place.name }, scraper);
}

const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Cidade e rua de um endereço do Google ("Rua X, 123 - Bairro, Cidade - UF, CEP, Brazil"). */
function addressParts(address: string | null) {
  if (!address) return { city: null, street: null };
  const city = /,\s*([^,]+?)\s*-\s*[A-Z]{2}\b/.exec(address)?.[1] ?? null;
  const street = address.split(/[,-]/)[0]?.trim() || null;
  return { city, street: street && street.length >= 6 ? street : null };
}

/**
 * Perfil do Google sem site: procura o site da empresa na busca do Google e só o aceita se o telefone
 * ou a rua do perfil aparecerem nele (para não misturar com outra empresa de nome parecido).
 */
async function discoverSite(name: string, address: string | null, phones: string[], scraper: ScraperService): Promise<ScrapeResult | null> {
  const { city, street } = addressParts(address);
  const results = await webResults([`"${name}"`, city].filter(Boolean).join(' '), 10);
  const hosts = new Set<string>();
  const candidates = results
    .map((r) => {
      try {
        return new URL(r.url);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => {
      if (!u) return false;
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      if (isIgnoredHost(host) || socialNetworkOf(u) || isGoogleBusinessUrl(u) || hosts.has(host)) return false;
      hosts.add(host);
      return true;
    })
    .slice(0, 3);
  if (!candidates.length) return null;
  const local = phones.map((d) => d.slice(-8));
  const scraped = await Promise.allSettled(candidates.map((u) => scraper.scrape(new URL(u.origin))));
  for (const r of scraped) {
    if (r.status !== 'fulfilled') continue;
    const digits = digitsOnly(r.value.corpus);
    const samePhone = local.some((d) => digits.includes(d));
    const sameStreet = !!street && norm(r.value.corpus).includes(norm(street));
    if (samePhone || sameStreet) return r.value;
  }
  return null;
}

async function fromPlaceInfo(input: URL, info: { text: string; mapsUri: string; title: string }, scraper: ScraperService): Promise<{ scrape: ScrapeResult; website: string | null }> {
  const text = info.text.replace(/\*\*/g, '').replace(/^\s*[*•-]\s*/gm, '');
  const phones = new Set<string>();
  for (const m of text.match(PHONE_RE) ?? []) {
    const d = toBrazilE164Digits(m);
    if (d) phones.add(d);
  }
  const emails = new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
  const zipCodes = new Set((text.match(ZIP_RE) ?? []).map((z) => z.replace(/\D/g, '')));

  // "Site" do perfil: rede social vira rede social; site próprio é lido também
  const siteMatch = /^\s*Site:\s*(\S+)/im.exec(text)?.[1];
  let site: URL | null = null;
  try {
    site = siteMatch ? new URL(/^https?:\/\//i.test(siteMatch) ? siteMatch : `https://${siteMatch}`) : null;
  } catch {
    site = null;
  }
  const socials: ScrapeResult['found']['socials'] = [];
  const network = site ? socialNetworkOf(site) : null;
  if (site && network) socials.push({ network, url: normalizeSocialUrl(site) });

  const googlePage = { url: info.mapsUri, title: `${info.title} — Perfil no Google`, description: 'Dados do Perfil da Empresa no Google (Google Maps)', text };
  let scrape: ScrapeResult = {
    requestedUrl: input.toString(),
    finalUrl: info.mapsUri,
    pages: [googlePage],
    jsonLd: [],
    found: { phones: [...phones], whatsapps: [], emails: [...emails], socials, zipCodes: [...zipCodes] },
    images: [],
    corpus: text,
  };

  let website: string | null = null;
  let fromSite: ScrapeResult | null = null;
  if (site && !network && !isGoogleBusinessUrl(site)) {
    website = site.origin;
    fromSite = await scraper.scrape(site).catch((err) => {
      // Site fora do ar: segue só com o perfil do Google
      console.warn('[google] site do perfil não pôde ser lido:', err instanceof Error ? err.message : err);
      return null;
    });
  } else {
    // Sem site no perfil: procura o site da empresa (fotos e mais informações), confirmado pelo telefone/endereço
    const address = /^\s*Endereço(?: completo)?:\s*(.+)$/im.exec(text)?.[1] ?? null;
    fromSite = await discoverSite(info.title, address, [...phones], scraper).catch(() => null);
  }
  if (fromSite) {
    website = new URL(fromSite.finalUrl).origin;
    scrape = {
      ...fromSite,
      requestedUrl: input.toString(),
      pages: [googlePage, ...fromSite.pages],
      found: {
        phones: [...new Set([...phones, ...fromSite.found.phones])],
        whatsapps: fromSite.found.whatsapps,
        emails: [...new Set([...emails, ...fromSite.found.emails])],
        socials: [...socials, ...fromSite.found.socials],
        zipCodes: [...new Set([...zipCodes, ...fromSite.found.zipCodes])],
      },
      corpus: `${text}\n${fromSite.corpus}`,
    };
  }
  return { scrape, website };
}
