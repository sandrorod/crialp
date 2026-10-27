import { Router } from 'express';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { authUser } from '../middleware/auth.js';
import { matchRegisteredCompanies } from '../repositories/companies.js';
import { urlErrorsFor } from '../repositories/urlErrors.js';

export const dentmapRouter = Router();

/** Perfil de dentista no DentMap: /dentistas/<cidade>/<nome>-<código de 8 caracteres>. */
const PROFILE_PATH = /^\/dentistas\/[^/]+\/[^/]+-[a-z0-9]{8}$/i;

function dentmapUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new AppError(400, 'Informe um link do DentMap (https://dentmap.com.br/...).', 'BAD_REQUEST');
  }
  if (!/^(www\.)?dentmap\.com\.br$/i.test(url.hostname)) throw new AppError(400, 'O link precisa ser do DentMap (dentmap.com.br).', 'BAD_REQUEST');
  url.protocol = 'https:';
  url.hash = '';
  return url;
}

/**
 * GET /api/dentmap-links?url=… — lê a página do DentMap informada e lista os perfis de dentistas que aparecem
 * nela (só esta página), marcando os já cadastrados. Cada perfil vira uma LP pela análise de link de sempre.
 */
dentmapRouter.get('/dentmap-links', async (req, res) => {
  const user = authUser(req);
  const { url: raw } = z.object({ url: z.string().trim().min(1, 'Informe o link do DentMap.').max(2048) }).parse(req.query);
  const page = dentmapUrl(raw);

  let found: { url: string; name: string }[];
  if (PROFILE_PATH.test(page.pathname.replace(/\/$/, ''))) {
    // O próprio link já é um perfil
    found = [{ url: `${page.origin}${page.pathname.replace(/\/$/, '')}`, name: '' }];
  } else {
    const r = await fetch(page, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LPBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!r?.ok) throw new AppError(502, `Não foi possível abrir a página do DentMap${r ? ` (${r.status})` : ''}. Tente de novo.`, 'DENTMAP_ERROR');
    const $ = cheerio.load(await r.text());
    const byUrl = new Map<string, string>();
    $('a[href]').each((_, el) => {
      let href: URL;
      try {
        href = new URL($(el).attr('href')!, page);
      } catch {
        return;
      }
      if (!/^(www\.)?dentmap\.com\.br$/i.test(href.hostname)) return;
      const path = href.pathname.replace(/\/$/, '');
      if (!PROFILE_PATH.test(path)) return;
      const key = `https://dentmap.com.br${path}`;
      // Texto do link: "Ver perfil de <nome>" (o mesmo perfil pode aparecer mais de uma vez)
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
      user.organizationId,
      found.map((f) => ({ url: f.url, website: null, name: f.name, phone: null })),
    ),
    urlErrorsFor(
      user.organizationId,
      found.map((f) => f.url),
    ),
  ]);
  res.json({
    items: found.map((f, i) => ({ ...f, existing: registered[i], analysis_error: registered[i] ? null : failures[i] })),
  });
});
