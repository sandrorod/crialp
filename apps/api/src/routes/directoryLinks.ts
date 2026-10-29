import { Router } from 'express';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { authUser } from '../middleware/auth.js';
import { matchRegisteredCompanies } from '../repositories/companies.js';
import { urlErrorsFor } from '../repositories/urlErrors.js';

/** Diretório de profissionais (DentMap, Doctoralia): como reconhecer, na página de lista, os links de perfil. */
interface Directory {
  /** Nome exibido nas mensagens */
  label: string;
  /** Hosts aceitos e o endereço canônico dos perfis */
  host: RegExp;
  origin: string;
  /** Caminho (sem barra no fim) de um perfil de profissional ou clínica; `listPath`: caminho da página de lista lida */
  isProfile: (path: string, listPath?: string) => boolean;
  /**
   * Texto que todo link de perfil tem na lista (DentMap: "Ver perfil de …"): links sem ele no mesmo formato
   * (ex.: bairros como /dentistas/sao-paulo/itaim-paulista) não são perfis
   */
  profileText?: RegExp;
  /** Parâmetro da paginação das listas (DentMap: ?pagina=2; Doctoralia: ?page=2) */
  pageParam?: string;
}

const DIRECTORIES: Record<'dentmap' | 'doctoralia', Directory> = {
  // /dentistas/<cidade>/<nome>-<código de 8 caracteres>
  dentmap: {
    label: 'DentMap',
    host: /^(www\.)?dentmap\.com\.br$/i,
    origin: 'https://dentmap.com.br',
    isProfile: (path) => /^\/dentistas\/[^/]+\/[^/]+-[a-z0-9]{8}$/i.test(path),
    profileText: /ver perfil de/i,
    pageParam: 'pagina',
  },
  // Profissional: /<nome>/<especialidade>/<cidade>; clínica: /clinicas/<nome>.
  // Na lista /<especialidade>/<cidade>, os filtros (/<especialidade>/<cidade>/<convênio>) não são perfis.
  doctoralia: {
    label: 'Doctoralia',
    host: /^(www\.)?doctoralia\.com\.br$/i,
    origin: 'https://www.doctoralia.com.br',
    isProfile: (path, listPath) => {
      const segs = path.split('/').filter(Boolean);
      if (segs.length === 2) return segs[0] === 'clinicas';
      const listFirst = listPath?.split('/').filter(Boolean)[0];
      return segs.length === 3 && !DOCTORALIA_SECTIONS.has(segs[0]) && segs[0] !== listFirst && segs.every((s) => /^[a-z0-9-]+$/i.test(s));
    },
    pageParam: 'page',
  },
};

/** Seções do Doctoralia com 3 níveis de caminho que não são perfis */
const DOCTORALIA_SECTIONS = new Set(['clinicas', 'perguntas-respostas', 'tratamentos-servicos', 'doencas', 'blog', 'pesquisa', 'ajuda', 'marketing']);

async function fetchPage(dir: Directory, url: URL) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPBot/1.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r?.ok) throw new AppError(502, `Não foi possível abrir a página do ${dir.label}${r ? ` (${r.status})` : ''}. Tente de novo.`, 'DIRECTORY_ERROR');
  return r.text();
}

/** Limite de páginas de uma lista (evita varreduras enormes) */
const MAX_PAGES = 2000;

/**
 * Todas as páginas da lista (?pagina=1…N ou ?page=1…N). A última é a primeira sem o link para a seguinte: busca exponencial
 * e depois binária (umas 20 leituras mesmo com centenas de páginas).
 */
async function listPages(dir: Directory, raw: string) {
  const param = dir.pageParam!;
  const base = directoryUrl(dir, raw);
  base.searchParams.delete(param);
  if (dir.isProfile(base.pathname.replace(/\/$/, '')) && !dir.profileText)
    throw new AppError(400, 'Informe o link de uma lista, não de um perfil.', 'BAD_REQUEST');
  const pageUrl = (n: number) => {
    const u = new URL(base);
    if (n > 1) u.searchParams.set(param, String(n));
    return u.toString();
  };
  const hasNext = async (n: number) => new RegExp(`[?&]${param}=${n + 1}(?![0-9])`).test(await fetchPage(dir, new URL(pageUrl(n))));
  let last = 1;
  if (await hasNext(1)) {
    // lo: página que tem a seguinte; hi: página sem a seguinte
    let lo = 1;
    let hi = 2;
    while (hi < MAX_PAGES && (await hasNext(hi))) {
      lo = hi;
      hi = Math.min(MAX_PAGES, hi * 2);
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (await hasNext(mid)) lo = mid;
      else hi = mid;
    }
    last = hi;
  }
  return Array.from({ length: last }, (_, i) => pageUrl(i + 1));
}

function directoryUrl(dir: Directory, raw: string) {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new AppError(400, `Informe um link do ${dir.label} (${dir.origin}/...).`, 'BAD_REQUEST');
  }
  if (!dir.host.test(url.hostname)) throw new AppError(400, `O link precisa ser do ${dir.label} (${new URL(dir.origin).hostname}).`, 'BAD_REQUEST');
  url.protocol = 'https:';
  url.hash = '';
  return url;
}

/**
 * Lê a página do diretório informada e lista os perfis que aparecem nela (só esta página), marcando os já
 * cadastrados. Cada perfil vira uma LP pela análise de link de sempre (que lê só a página do próprio perfil).
 */
async function listProfiles(dir: Directory, orgId: string, raw: string) {
  const page = directoryUrl(dir, raw);
  const pagePath = page.pathname.replace(/\/$/, '');

  let found: { url: string; name: string }[];
  // Com texto de perfil (DentMap), a página é lida antes: um bairro tem o mesmo formato de link de um perfil
  if (dir.isProfile(pagePath) && !dir.profileText) {
    // O próprio link já é um perfil
    found = [{ url: `${dir.origin}${pagePath}`, name: '' }];
  } else {
    const $ = cheerio.load(await fetchPage(dir, page));
    const byUrl = new Map<string, string>();
    const marked = new Set<string>();
    $('a[href]').each((_, el) => {
      let href: URL;
      try {
        href = new URL($(el).attr('href')!, page);
      } catch {
        return;
      }
      if (!dir.host.test(href.hostname)) return;
      const path = href.pathname.replace(/\/$/, '');
      if (!dir.isProfile(path, pagePath)) return;
      const key = `${dir.origin}${path}`;
      // Texto do link (o mesmo perfil pode aparecer mais de uma vez; vale o primeiro com nome)
      const name = $(el)
        .text()
        .replace(/\s+/g, ' ')
        .replace(/^\s*ver perfil de\s*/i, '')
        .trim();
      if (dir.profileText?.test($(el).text())) marked.add(key);
      if (!byUrl.has(key) || (!byUrl.get(key) && name)) byUrl.set(key, name);
    });
    found = [...byUrl].filter(([url]) => !dir.profileText || marked.has(url)).map(([url, name]) => ({ url, name }));
    // Página sem lista de perfis, no formato de perfil: é o próprio perfil
    if (!found.length && dir.isProfile(pagePath)) found = [{ url: `${dir.origin}${pagePath}`, name: '' }];
  }

  const [registered, failures] = await Promise.all([
    matchRegisteredCompanies(
      orgId,
      found.map((f) => ({ url: f.url, website: null, name: f.name, phone: null })),
    ),
    urlErrorsFor(
      orgId,
      found.map((f) => f.url),
    ),
  ]);
  return found.map((f, i) => ({ ...f, existing: registered[i], analysis_error: registered[i] ? null : failures[i] }));
}

export const directoryLinksRouter = Router();

/** GET /api/dentmap-links?url=… e /api/doctoralia-links?url=… — perfis que aparecem na página informada. */
for (const [key, dir] of Object.entries(DIRECTORIES)) {
  directoryLinksRouter.get(`/${key}-links`, async (req, res) => {
    const user = authUser(req);
    const { url } = z.object({ url: z.string().trim().min(1, `Informe o link do ${dir.label}.`).max(2048) }).parse(req.query);
    res.json({ items: await listProfiles(dir, user.organizationId, url) });
  });
  // GET /api/dentmap-pages?url=… e /api/doctoralia-pages?url=… — todas as páginas da lista, para a fila de links
  if (dir.pageParam) {
    directoryLinksRouter.get(`/${key}-pages`, async (req, res) => {
      authUser(req);
      const { url } = z.object({ url: z.string().trim().min(1, `Informe o link do ${dir.label}.`).max(2048) }).parse(req.query);
      res.json({ pages: await listPages(dir, url) });
    });
  }
}
