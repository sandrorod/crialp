import { one, query, transaction } from '../db/pool.js';
import { uniqueSlug } from '../lib/slug.js';
import type { LandingContent } from '../services/ai/schemas.js';
import type { ThemeSettings } from '../landing/theme.js';

export interface LandingPageRow {
  id: string;
  organization_id: string;
  company_id: string;
  title: string;
  slug: string;
  status: 'ativa' | 'inativa';
  content: LandingContent;
  theme: ThemeSettings;
  html_content: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image: string | null;
  current_version: number;
  custom_domain: string | null;
  domain_status: string;
  ssl_status: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface SeoFields {
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image?: string | null;
}

export async function createLandingPage(opts: {
  orgId: string;
  companyId: string;
  userId: string;
  title: string;
  content: LandingContent;
  theme: ThemeSettings;
  seo: SeoFields;
}) {
  const slug = await uniqueSlug(opts.title);
  return transaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into landing_pages (organization_id, company_id, title, slug, status, content, theme, seo_title, seo_description, seo_keywords, og_image, current_version)
       values ($1,$2,$3,$4,'inativa',$5,$6,$7,$8,$9,$10,1) returning id`,
      [opts.orgId, opts.companyId, opts.title, slug, JSON.stringify(opts.content), JSON.stringify(opts.theme),
        opts.seo.seo_title, opts.seo.seo_description, opts.seo.seo_keywords, opts.seo.og_image ?? null],
    );
    await db.query(
      `insert into landing_page_versions (landing_page_id, version, content, note, created_by) values ($1, 1, $2, $3, $4)`,
      [rows[0].id, JSON.stringify({ content: opts.content, theme: opts.theme, seo: opts.seo }), 'Geração inicial pela IA', opts.userId],
    );
    return rows[0].id;
  });
}

/** Salva conteúdo/tema/SEO como nova versão (regeneração, edição manual ou restauração). */
export async function saveVersion(opts: {
  id: string;
  orgId: string;
  userId: string;
  content: LandingContent;
  theme: ThemeSettings;
  seo: SeoFields;
  note: string;
}) {
  return transaction(async (db) => {
    const { rows } = await db.query<{ current_version: number }>(
      `update landing_pages
          set content = $3, theme = $4, seo_title = $5, seo_description = $6, seo_keywords = $7, og_image = $8,
              current_version = current_version + 1
        where id = $1 and organization_id = $2
        returning current_version`,
      [opts.id, opts.orgId, JSON.stringify(opts.content), JSON.stringify(opts.theme), opts.seo.seo_title,
        opts.seo.seo_description, opts.seo.seo_keywords, opts.seo.og_image ?? null],
    );
    if (!rows[0]) return null;
    await db.query(
      `insert into landing_page_versions (landing_page_id, version, content, note, created_by) values ($1,$2,$3,$4,$5)`,
      [opts.id, rows[0].current_version, JSON.stringify({ content: opts.content, theme: opts.theme, seo: opts.seo }), opts.note, opts.userId],
    );
    // Mantém as 30 versões mais recentes
    await db.query(
      `delete from landing_page_versions where landing_page_id = $1 and version <= $2`,
      [opts.id, rows[0].current_version - 30],
    );
    return rows[0].current_version;
  });
}

export function getLandingPage(orgId: string, id: string) {
  return one<LandingPageRow>('select * from landing_pages where id = $1 and organization_id = $2', [id, orgId]);
}

export function getLandingPageBySlug(slug: string) {
  return one<LandingPageRow>('select * from landing_pages where slug = $1', [slug]);
}

export function getLandingPageByDomain(domain: string) {
  return one<LandingPageRow>(
    `select * from landing_pages where lower(custom_domain) = lower($1) and domain_status in ('verified','active')`,
    [domain],
  );
}

export async function listLandingPages(orgId: string, f: { search?: string; status?: string }) {
  const where = ['lp.organization_id = $1'];
  const params: unknown[] = [orgId];
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    where.push(`(lower(c.name) like $${params.length} or lp.slug like $${params.length})`);
  }
  if (f.status === 'ativa' || f.status === 'inativa') {
    params.push(f.status);
    where.push(`lp.status = $${params.length}`);
  }
  const { rows } = await query(
    `select lp.id, lp.title, lp.slug, lp.status, lp.custom_domain, lp.domain_status, lp.current_version,
            lp.created_at, lp.updated_at, lp.published_at, c.id as company_id, c.name as company_name, c.segment
       from landing_pages lp join companies c on c.id = lp.company_id
      where ${where.join(' and ')}
      order by lp.updated_at desc limit 500`,
    params,
  );
  return rows;
}

export async function setStatus(orgId: string, id: string, status: 'ativa' | 'inativa') {
  const row = await one<LandingPageRow>(
    `update landing_pages
        set status = $3, published_at = case when $3 = 'ativa' then coalesce(published_at, now()) else published_at end
      where id = $1 and organization_id = $2 returning *`,
    [id, orgId, status],
  );
  return row;
}

export async function updateSettings(orgId: string, id: string, s: { slug?: string; custom_domain?: string | null }) {
  const current = await getLandingPage(orgId, id);
  if (!current) return null;
  const domainChanged = s.custom_domain !== undefined && (s.custom_domain ?? null) !== current.custom_domain;
  return one<LandingPageRow>(
    `update landing_pages set
        slug = coalesce($3, slug),
        custom_domain = case when $4 then $5 else custom_domain end,
        domain_status = case when $4 then (case when $5::text is null then 'none' else 'pending' end) else domain_status end,
        ssl_status    = case when $4 then (case when $5::text is null then 'none' else 'pending' end) else ssl_status end
      where id = $1 and organization_id = $2 returning *`,
    [id, orgId, s.slug ?? null, domainChanged, s.custom_domain ?? null],
  );
}

export async function updateDomainStatus(orgId: string, id: string, domain_status: string, ssl_status: string) {
  return one<LandingPageRow>(
    `update landing_pages set domain_status = $3, ssl_status = $4 where id = $1 and organization_id = $2 returning *`,
    [id, orgId, domain_status, ssl_status],
  );
}

export async function saveSnapshot(id: string, html: string) {
  await query('update landing_pages set html_content = $2 where id = $1', [id, html]);
}

export async function deleteLandingPage(orgId: string, id: string) {
  const res = await query('delete from landing_pages where id = $1 and organization_id = $2', [id, orgId]);
  return (res.rowCount ?? 0) > 0;
}

export async function listVersions(id: string) {
  const { rows } = await query(
    `select v.version, v.note, v.created_at, u.name as author
       from landing_page_versions v left join users u on u.id = v.created_by
      where v.landing_page_id = $1 order by v.version desc`,
    [id],
  );
  return rows;
}

export function getVersion(id: string, version: number) {
  return one<{ content: { content: LandingContent; theme: ThemeSettings; seo: SeoFields } }>(
    'select content from landing_page_versions where landing_page_id = $1 and version = $2',
    [id, version],
  );
}

export async function dashboardStats(orgId: string) {
  const counts = await one<{ companies: string; pages: string; active: string; inactive: string }>(
    `select
        (select count(*) from companies where organization_id = $1)::text as companies,
        (select count(*) from landing_pages where organization_id = $1)::text as pages,
        (select count(*) from landing_pages where organization_id = $1 and status = 'ativa')::text as active,
        (select count(*) from landing_pages where organization_id = $1 and status = 'inativa')::text as inactive`,
    [orgId],
  );
  const { rows: recent } = await query(
    `select lp.id, lp.slug, lp.status, lp.created_at, c.name as company_name, c.segment
       from landing_pages lp join companies c on c.id = lp.company_id
      where lp.organization_id = $1 order by lp.created_at desc limit 6`,
    [orgId],
  );
  return {
    companies: Number(counts?.companies ?? 0),
    landing_pages: Number(counts?.pages ?? 0),
    active: Number(counts?.active ?? 0),
    inactive: Number(counts?.inactive ?? 0),
    recent,
  };
}
