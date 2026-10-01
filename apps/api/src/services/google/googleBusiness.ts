import { AppError } from '../../lib/errors.js';
import { toBrazilE164Digits } from '../../lib/phone.js';
import { aiService } from '../ai/index.js';
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
  const info = await aiService.describeGooglePlace(query, latLng);
  if (!info) throw new AppError(422, `Não consegui ler os dados de "${query}" no Google Maps (empresas que atendem no local do cliente, sem endereço público, às vezes não aparecem). Use o site da empresa ou preencha os dados manualmente.`, 'GOOGLE_NOT_FOUND');

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
  if (site && !network && !isGoogleBusinessUrl(site)) {
    try {
      const fromSite = await scraper.scrape(site);
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
    } catch (err) {
      // Site fora do ar: segue só com o perfil do Google
      console.warn('[google] site do perfil não pôde ser lido:', err instanceof Error ? err.message : err);
      website = site.origin;
    }
  }
  return { scrape, website };
}
