import { query, transaction } from '../db/pool.js';
import { formatBrazilPhone } from '../lib/phone.js';
import type { ScrapeResult } from '../services/scraper/ScraperService.js';

export interface SourceData {
  final_url: string;
  fetched_at: string;
  phones: string[];
  whatsapps: string[];
  emails: string[];
  socials: { network: string; url: string }[];
  zip_codes: string[];
  images: { url: string; width?: number; height?: number; alt: string }[];
  json_ld: unknown[];
}

/** Conteúdo bruto de uma coleta, no formato armazenado. */
export function toSourcePayload(scrape: ScrapeResult) {
  const data: SourceData = {
    final_url: scrape.finalUrl,
    fetched_at: new Date().toISOString(),
    phones: scrape.found.phones.map((p) => formatBrazilPhone(p)),
    whatsapps: scrape.found.whatsapps.map((p) => formatBrazilPhone(p)),
    emails: scrape.found.emails,
    socials: scrape.found.socials,
    zip_codes: scrape.found.zipCodes.map((z) => `${z.slice(0, 5)}-${z.slice(5)}`),
    images: scrape.images.map((i) => ({ url: i.url, width: i.width, height: i.height, alt: i.alt })),
    json_ld: JSON.stringify(scrape.jsonLd).length < 60_000 ? scrape.jsonLd : [],
  };
  const pages = scrape.pages.map((p) => ({ url: p.url, title: p.title, description: p.description, content: p.text }));
  return { data, pages };
}

export type SourcePayload = ReturnType<typeof toSourcePayload>;

export async function saveSources(companyId: string, payload: SourcePayload) {
  await transaction(async (db) => {
    await db.query('delete from company_sources where company_id = $1', [companyId]);
    for (const [i, p] of payload.pages.entries()) {
      await db.query(
        `insert into company_sources (company_id, url, title, description, content, position) values ($1,$2,$3,$4,$5,$6)`,
        [companyId, p.url, p.title || null, p.description || null, p.content, i],
      );
    }
    await db.query('update companies set source_data = $2 where id = $1', [companyId, JSON.stringify(payload.data)]);
  });
}

export async function getSources(companyId: string) {
  const [{ rows: pages }, { rows }] = await Promise.all([
    query('select url, title, description, content, fetched_at from company_sources where company_id = $1 order by position', [companyId]),
    query<{ source_data: SourceData | Record<string, never> }>('select source_data from companies where id = $1', [companyId]),
  ]);
  return { pages, data: rows[0]?.source_data ?? {} };
}
