import * as cheerio from 'cheerio';
import { AppError, Messages } from '../../lib/errors.js';
import { assertPublicHost, sameSite } from '../../lib/url.js';
import { toBrazilE164Digits } from '../../lib/phone.js';
import { mapLimit, probeImage } from './imageProbe.js';

export type SocialNetwork = 'instagram' | 'facebook' | 'youtube' | 'linkedin' | 'tiktok' | 'twitter' | 'pinterest' | 'threads';

export interface ScrapedImage {
  index: number;
  url: string;
  alt: string;
  context: string; // de onde veio: og:image, header, logo, conteúdo...
  logoHint: boolean;
  width?: number;
  height?: number;
}

export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  text: string;
}

export interface ScrapeResult {
  requestedUrl: string;
  finalUrl: string;
  pages: ScrapedPage[];
  jsonLd: unknown[];
  found: {
    phones: string[];     // dígitos normalizados (55DDDNNNN...)
    whatsapps: string[];  // dígitos normalizados
    emails: string[];
    socials: { network: SocialNetwork; url: string }[];
    zipCodes: string[];
  };
  images: ScrapedImage[];
  /** Texto consolidado de todas as páginas — usado na verificação anti-invenção. */
  corpus: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 LPBot/1.0';
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_EXTRA_PAGES = 12;
/** Limite do material enviado à IA (o conteúdo integral fica guardado para o administrador). */
const MAX_AI_DOCUMENT = 70_000;
const MAX_PAGE_TEXT = 12_000;
const MAX_IMAGE_CANDIDATES = 120;
const MAX_IMAGES = 40;
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** "a.jpg 640w, b.jpg 1280w" → maior candidato. */
function bestFromSrcset(value: string): string | null {
  let best: { url: string; score: number } | null = null;
  for (const part of value.split(/,\s+(?=\S)/)) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url || url.startsWith('data:')) continue;
    const n = descriptor ? parseFloat(descriptor) : 1;
    const score = descriptor?.endsWith('x') ? n * 1000 : n || 1;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

/**
 * Endereço real de uma imagem, inclusive com lazy loading (data-src, data-lazy-srcset,
 * nitro-lazy-src, data-bg...). O `src` costuma ser só um marcador vazio nesses casos.
 */
function imageUrlFromAttributes(attribs: Record<string, string>): string | null {
  const entries = Object.entries(attribs).filter(([, v]) => v && !v.startsWith('data:'));
  for (const [name, value] of entries) {
    if (/srcset/i.test(name)) {
      const best = bestFromSrcset(value);
      if (best) return best;
    }
  }
  for (const [name, value] of entries) {
    if (name !== 'src' && /(src|bg|background|image|original|full|lazy)/i.test(name) && (IMG_EXT.test(value) || /^(https?:)?\/\//.test(value))) {
      return value.trim();
    }
  }
  const src = attribs.src;
  return src && !src.startsWith('data:') ? src.trim() : null;
}

const BG_URL_RE = /background(?:-image)?\s*:[^;]*url\((['"]?)([^'")]+)\1\)/gi;

/** Mesma foto em tamanhos diferentes (WordPress: foto-700x480.jpg) conta uma vez só. */
function imageKey(url: string) {
  return url
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, '')
    .replace(/-\d{2,4}x(?=\.\w+$)/, '')
    .replace(/^.*\/wp-content\//, 'wp/')
    .replace(/\.(jpe?g|png|webp|gif|avif)$/, '');
}

const PAGE_KEYWORDS = [
  'sobre', 'quem-somos', 'quemsomos', 'empresa', 'institucional', 'historia',
  'servico', 'servicos', 'serviços', 'solucoes', 'soluções', 'tratamento', 'especialidade', 'area-de-atuacao', 'atuacao',
  'produto', 'produtos', 'cardapio', 'cardápio', 'menu', 'planos', 'modalidades',
  'contato', 'fale-conosco', 'faleconosco', 'localizacao', 'onde-estamos', 'unidades',
  'depoimentos', 'avaliacoes', 'clientes',
];

const SOCIAL_PATTERNS: [SocialNetwork, RegExp][] = [
  ['instagram', /(^|\.)instagram\.com$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['twitter', /(^|\.)(twitter\.com|x\.com)$/],
  ['pinterest', /(^|\.)pinterest\.(com|com\.br)$/],
  ['threads', /(^|\.)threads\.net$/],
];
const SOCIAL_SHARE_PATH = /(sharer|share|intent|dialog|plugins|embed|watch\?v=|\/p\/|\/reel\/|\/posts?\/|\/status\/)/i;

interface FetchedHtml {
  url: URL;
  html: string;
}

/** Busca HTML com timeout, limite de tamanho e verificação de host em cada redirecionamento. */
async function fetchHtml(start: URL): Promise<FetchedHtml> {
  let current = start;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicHost(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
        },
      });
    } catch {
      clearTimeout(timer);
      throw new AppError(422, Messages.unreachable, 'FETCH_FAILED');
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      current = new URL(res.headers.get('location')!, current);
      if (!['http:', 'https:'].includes(current.protocol)) throw new AppError(422, Messages.unreachable, 'BAD_REDIRECT');
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      const code = res.status === 401 || res.status === 403 ? 'PROTECTED' : 'HTTP_ERROR';
      throw new AppError(422, code === 'PROTECTED' ? Messages.insufficient : Messages.unreachable, code);
    }
    const type = res.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) {
      clearTimeout(timer);
      throw new AppError(422, Messages.insufficient, 'NOT_HTML');
    }

    try {
      const buffer = await readLimited(res);
      return { url: current, html: decodeHtml(buffer, type) };
    } catch {
      throw new AppError(422, Messages.unreachable, 'READ_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError(422, Messages.unreachable, 'TOO_MANY_REDIRECTS');
}

async function readLimited(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, out.length - offset), offset);
    offset += c.byteLength;
    if (offset >= out.length) break;
  }
  return out;
}

/** Muitos sites brasileiros antigos ainda usam ISO-8859-1 / Windows-1252. */
function decodeHtml(buffer: Uint8Array, contentType: string): string {
  const headerCharset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(utf8.slice(0, 4096))?.[1];
  const charset = (headerCharset ?? metaCharset ?? 'utf-8').toLowerCase();
  if (charset === 'utf-8' || charset === 'utf8') return utf8;
  try {
    return new TextDecoder(charset === 'iso-8859-1' ? 'windows-1252' : charset).decode(buffer);
  } catch {
    return utf8;
  }
}

function cleanLine(s: string) {
  return s.replace(/[ \s]+/g, ' ').trim();
}

function absolutize(href: string | undefined, base: URL): URL | null {
  if (!href) return null;
  try {
    return new URL(href.trim(), base);
  } catch {
    return null;
  }
}

function socialNetworkOf(url: URL): SocialNetwork | null {
  const host = url.hostname.toLowerCase();
  for (const [network, re] of SOCIAL_PATTERNS) if (re.test(host)) return network;
  return null;
}

function normalizeSocialUrl(url: URL) {
  const clean = new URL(url.toString());
  clean.search = '';
  clean.hash = '';
  clean.hostname = clean.hostname.replace(/^(m|mobile|pt-br|br)\./, 'www.');
  return clean.toString().replace(/\/$/, '');
}

function whatsappFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'wa.me' || host.endsWith('.wa.me')) return toBrazilE164Digits(url.pathname.slice(1)) ?? null;
  if (host.includes('whatsapp.com')) return toBrazilE164Digits(url.searchParams.get('phone')) ?? null;
  if (url.protocol === 'whatsapp:') return toBrazilE164Digits(url.searchParams.get('phone')) ?? null;
  return null;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?55[\s.-]?)?\(?\b[1-9]\d\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const ZIP_RE = /\b\d{5}-?\d{3}\b/g;

function extractJsonLd($: cheerio.CheerioAPI): unknown[] {
  const out: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed];
      for (const item of items) out.push(item);
    } catch {
      /* JSON-LD inválido: ignorar */
    }
  });
  return out;
}

function pageText($: cheerio.CheerioAPI): string {
  const $body = $('body').clone();
  $body.find('script, style, noscript, svg, iframe, template, form select').remove();
  $body.find('br, p, div, li, h1, h2, h3, h4, h5, h6, section, article, header, footer, tr, td, th, dt, dd, blockquote, figcaption, address').each((_, el) => {
    $(el).append('\n');
  });
  $body.find('h1, h2, h3').each((_, el) => {
    $(el).prepend('\n## ');
  });
  const lines = $body.text().split('\n').map(cleanLine).filter((l) => l.length > 1);
  return lines.join('\n');
}

export class ScraperService {
  async scrape(start: URL): Promise<ScrapeResult> {
    const first = await fetchHtml(start);
    const base = first.url;
    const pagesHtml: FetchedHtml[] = [first];

    // Descobre páginas internas relevantes (sobre, serviços, contato...)
    const $first = cheerio.load(first.html);
    const candidates = new Map<string, number>();
    $first('a[href]').each((_, el) => {
      const url = absolutize($first(el).attr('href'), base);
      if (!url || !['http:', 'https:'].includes(url.protocol) || !sameSite(url, base)) return;
      url.hash = '';
      if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?|mp4)$/i.test(url.pathname)) return;
      const key = url.toString();
      if (key === base.toString() || url.pathname === '/' ) return;
      const haystack = `${decodeURIComponent(url.pathname)} ${$first(el).text()}`.toLowerCase();
      if (/(wp-login|wp-admin|login|carrinho|cart|checkout|minha-conta|account|politica-de-cookies|\/tag\/|\/author\/|\/page\/\d)/i.test(url.pathname)) return;
      // Páginas com palavras-chave primeiro; depois as demais páginas internas (menu, rodapé)
      const score = PAGE_KEYWORDS.reduce((s, k) => (haystack.includes(k) ? s + 1 : s), 0) + 0.1;
      candidates.set(key, Math.max(candidates.get(key) ?? 0, score));
    });
    const extraUrls = [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_EXTRA_PAGES)
      .map(([u]) => new URL(u));

    const extra = await Promise.allSettled(extraUrls.map((u) => fetchHtml(u)));
    for (const r of extra) if (r.status === 'fulfilled') pagesHtml.push(r.value);

    const result = this.parse(start, pagesHtml);
    result.images = await this.rankImages(result.images);
    return result;
  }

  /**
   * Mede cada imagem (sem baixá-la inteira), descarta ícones e miniaturas,
   * remove duplicatas de tamanho e ordena: logotipo primeiro, depois as maiores fotos.
   */
  async rankImages(images: ScrapedImage[]): Promise<ScrapedImage[]> {
    const seen = new Set<string>();
    const unique = images.filter((img) => {
      const k = imageKey(img.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const sizes = await mapLimit(unique, 8, (img) => probeImage(img.url));
    const measured = unique.map((img, i) => ({ ...img, width: sizes[i]?.width, height: sizes[i]?.height }));
    const kept = measured.filter((img) => {
      if (!img.width || !img.height) return false; // inacessível ou formato não suportado
      if (img.logoHint) return img.width >= 40;
      const ratio = img.width / img.height;
      return Math.min(img.width, img.height) >= 280 && img.width * img.height >= 150_000 && ratio < 4 && ratio > 0.25;
    });
    kept.sort((a, b) => Number(b.logoHint) - Number(a.logoHint) || b.width! * b.height! - a.width! * a.height!);
    return kept.slice(0, MAX_IMAGES).map((img, index) => ({ ...img, index }));
  }

  private parse(requested: URL, fetched: FetchedHtml[]): ScrapeResult {
    const pages: ScrapedPage[] = [];
    const jsonLd: unknown[] = [];
    const phones = new Set<string>();
    const whatsapps = new Set<string>();
    const emails = new Set<string>();
    const zipCodes = new Set<string>();
    const socials = new Map<string, { network: SocialNetwork; url: string }>();
    const images = new Map<string, Omit<ScrapedImage, 'index'>>();
    const seenLines = new Set<string>();

    const addImage = (raw: string | undefined, base: URL, alt: string, context: string, logoHint = false) => {
      const url = absolutize(raw?.split(/\s+/)[0], base);
      if (!url || !['http:', 'https:'].includes(url.protocol)) return;
      if (/\.(svg)(\?|$)/i.test(url.pathname) && !logoHint) return;
      if (/(pixel|tracking|spacer|blank|facebook\.com\/tr)/i.test(url.toString())) return;
      const key = url.toString();
      const prev = images.get(key);
      if (prev) {
        prev.logoHint ||= logoHint;
        return;
      }
      if (images.size >= MAX_IMAGE_CANDIDATES) return;
      images.set(key, { url: key, alt: cleanLine(alt).slice(0, 160), context, logoHint });
    };

    for (const { url, html } of fetched) {
      const $ = cheerio.load(html);
      jsonLd.push(...extractJsonLd($));

      const title = cleanLine($('title').first().text());
      const description = cleanLine(
        $('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '',
      );

      // Links: telefone, e-mail, WhatsApp, redes sociais
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')?.trim() ?? '';
        if (/^tel:/i.test(href)) {
          const d = toBrazilE164Digits(decodeURIComponent(href.slice(4)));
          if (d) phones.add(d);
          return;
        }
        if (/^mailto:/i.test(href)) {
          const email = decodeURIComponent(href.slice(7).split('?')[0]).trim().toLowerCase();
          if (EMAIL_RE.test(email)) emails.add(email);
          EMAIL_RE.lastIndex = 0;
          return;
        }
        const abs = absolutize(href, url);
        if (!abs) return;
        const wa = whatsappFromUrl(abs);
        if (wa) {
          whatsapps.add(wa);
          return;
        }
        const network = socialNetworkOf(abs);
        if (network && abs.pathname.length > 1 && !SOCIAL_SHARE_PATH.test(abs.pathname + abs.search)) {
          const normalized = normalizeSocialUrl(abs);
          socials.set(normalized.toLowerCase(), { network, url: normalized });
        }
      });

      // Imagens: og:image, ícones, logos e imagens de conteúdo
      addImage($('meta[property="og:image"]').attr('content'), url, title, 'og:image');
      $('link[rel~="apple-touch-icon"]').each((_, el) => addImage($(el).attr('href'), url, 'ícone do site', 'icon', true));
      $('img, picture source').each((_, el) => {
        const $el = $(el);
        const src = imageUrlFromAttributes((el as any).attribs ?? {});
        if (!src) return;
        const w = Number($el.attr('width') ?? 0);
        const h = Number($el.attr('height') ?? 0);
        if ((w && w < 40) || (h && h < 40)) return;
        const alt = $el.attr('alt') ?? '';
        const marker = `${src} ${alt} ${$el.attr('class') ?? ''} ${$el.attr('id') ?? ''}`.toLowerCase();
        const inHeader = $el.closest('header, nav, .header, #header, .navbar').length > 0;
        const logoHint = marker.includes('logo') || marker.includes('marca') || (inHeader && $el.closest('a[href="/"], a[href="./"], .logo, .brand').length > 0);
        addImage(src, url, alt, inHeader ? 'cabeçalho' : 'conteúdo', logoHint);
      });
      // Imagens de fundo (banners, seções) em style inline ou atributos data-bg
      $('[style*="url("], [data-bg], [data-background], [data-bg-src], [data-background-image]').each((_, el) => {
        const attribs = ((el as any).attribs ?? {}) as Record<string, string>;
        const style = attribs.style ?? '';
        for (const m of style.matchAll(BG_URL_RE)) addImage(m[2], url, $(el).attr('aria-label') ?? '', 'fundo');
        for (const key of ['data-bg', 'data-background', 'data-bg-src', 'data-background-image']) {
          if (attribs[key]) addImage(attribs[key].replace(/^url\((['"]?)(.+)\1\)$/, '$2'), url, '', 'fundo');
        }
      });

      // Texto visível (sem repetir menus/rodapés já vistos em outras páginas)
      const text = pageText($)
        .split('\n')
        .filter((line) => {
          if (line.length < 60 && seenLines.has(line)) return false;
          seenLines.add(line);
          return true;
        })
        .join('\n')
        .slice(0, MAX_PAGE_TEXT);

      for (const m of text.match(EMAIL_RE) ?? []) {
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(m)) emails.add(m.toLowerCase());
      }
      for (const m of text.match(PHONE_RE) ?? []) {
        const d = toBrazilE164Digits(m);
        if (d) phones.add(d);
      }
      for (const m of text.match(ZIP_RE) ?? []) zipCodes.add(m.replace(/\D/g, ''));

      pages.push({ url: url.toString(), title, description, text });
    }

    // JSON-LD também pode conter contatos e redes (sameAs)
    for (const item of jsonLd as any[]) {
      if (!item || typeof item !== 'object') continue;
      const tel = item.telephone;
      for (const t of Array.isArray(tel) ? tel : [tel]) {
        const d = typeof t === 'string' ? toBrazilE164Digits(t) : null;
        if (d) phones.add(d);
      }
      if (typeof item.email === 'string') emails.add(item.email.replace(/^mailto:/, '').toLowerCase());
      const sameAs = Array.isArray(item.sameAs) ? item.sameAs : item.sameAs ? [item.sameAs] : [];
      for (const s of sameAs) {
        const u = typeof s === 'string' ? absolutize(s, new URL(fetched[0].url)) : null;
        const network = u && socialNetworkOf(u);
        if (u && network) {
          const normalized = normalizeSocialUrl(u);
          socials.set(normalized.toLowerCase(), { network, url: normalized });
        }
      }
      const logo = typeof item.logo === 'string' ? item.logo : item.logo?.url;
      if (typeof logo === 'string') addImage(logo, fetched[0].url, 'logotipo', 'json-ld', true);
      const img = typeof item.image === 'string' ? item.image : item.image?.url;
      if (typeof img === 'string') addImage(img, fetched[0].url, item.name ?? '', 'json-ld');
    }

    const corpus = [
      ...pages.map((p) => `${p.title}\n${p.description}\n${p.text}`),
      JSON.stringify(jsonLd),
    ].join('\n');

    return {
      requestedUrl: requested.toString(),
      finalUrl: fetched[0].url.toString(),
      pages,
      jsonLd,
      found: {
        phones: [...phones],
        whatsapps: [...whatsapps],
        emails: [...emails],
        socials: [...socials.values()],
        zipCodes: [...zipCodes],
      },
      images: [...images.values()].map((img, index) => ({ ...img, index })),
      corpus,
    };
  }
}

/** Monta o material bruto que será enviado à IA para interpretação. */
export function buildAnalysisDocument(scrape: ScrapeResult): string {
  const parts: string[] = [];
  parts.push(`URL ANALISADA: ${scrape.finalUrl}`);
  // Orçamento de texto por página, para que todas as páginas lidas contribuam
  const perPage = Math.floor((MAX_AI_DOCUMENT - 20_000) / Math.max(scrape.pages.length, 1));
  for (const page of scrape.pages) {
    parts.push(
      `\n=== PÁGINA: ${page.url} ===\nTítulo: ${page.title}\nDescrição (meta): ${page.description}\n\n${page.text.slice(0, Math.max(perPage, 3000))}`,
    );
  }
  if (scrape.jsonLd.length) {
    parts.push(`\n=== DADOS ESTRUTURADOS (JSON-LD) ===\n${JSON.stringify(scrape.jsonLd).slice(0, 8000)}`);
  }
  const f = scrape.found;
  parts.push(
    `\n=== CONTATOS ENCONTRADOS EM LINKS E TEXTO ===\n` +
      `Telefones: ${f.phones.join(', ') || 'nenhum'}\n` +
      `WhatsApp (links wa.me/api.whatsapp): ${f.whatsapps.join(', ') || 'nenhum'}\n` +
      `E-mails: ${f.emails.join(', ') || 'nenhum'}\n` +
      `CEPs: ${f.zipCodes.join(', ') || 'nenhum'}\n` +
      `Redes sociais: ${f.socials.map((s) => `${s.network}: ${s.url}`).join(' | ') || 'nenhuma'}`,
  );
  if (scrape.images.length) {
    parts.push(
      `\n=== IMAGENS ENCONTRADAS ===\n` + describeImages(scrape.images),
    );
  }
  return parts.join('\n');
}

/** Lista de imagens (índice, tamanho, alt, origem) no formato lido pela IA. */
export function describeImages(images: ScrapedImage[]): string {
  return images
    .map((i) => `[${i.index}] ${i.url} | ${i.width}x${i.height}px | alt: "${i.alt}" | origem: ${i.context}${i.logoHint ? ' | provável logotipo' : ''}`)
    .join('\n');
}
