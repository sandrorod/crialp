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
}

const DIRECTORIES: Record<'dentmap' | 'doctoralia', Directory> = {
  // /dentistas/<cidade>/<nome>-<código de 8 caracteres>
  dentmap: {
    label: 'DentMap',
    host: /^(www\.)?dentmap\.com\.br$/i,
    origin: 'https://dentmap.com.br',
    isProfile: (path) => /^\/dentistas\/[^/]+\/[^/]+-[a-z0-9]{8}$/i.test(path),
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
  },
};

/** Seções do Doctoralia com 3 níveis de caminho que não são perfis */
const DOCTORALIA_SECTIONS = new Set(['clinicas', 'perguntas-respostas', 'tratamentos-servicos', 'doencas', 'blog', 'pesquisa', 'ajuda', 'marketing']);

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
  if (dir.isProfile(pagePath)) {
    // O próprio link já é um perfil
    found = [{ url: `${dir.origin}${pagePath}`, name: '' }];
  } else {
    const r = await fetch(page, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!r?.ok) throw new AppError(502, `Não foi possível abrir a página do ${dir.label}${r ? ` (${r.status})` : ''}. Tente de novo.`, 'DIRECTORY_ERROR');
    const $ = cheerio.load(await r.text());
    const byUrl = new Map<string, string>();
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
      if (!byUrl.has(key) || (!byUrl.get(key) && name)) byUrl.set(key, name);
    });
    found = [...byUrl].map(([url, name]) => ({ url, name }));
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
}
