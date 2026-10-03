import type pg from 'pg';
import { one, query, transaction } from '../db/pool.js';
import type { CompanyInput } from '../lib/validation.js';
import { dropNullText } from '../lib/nullText.js';

export const COMPANY_COLUMNS = [
  'name', 'trade_name', 'legal_name', 'description', 'segment', 'reference_url', 'logo_url',
  'phone', 'mobile', 'whatsapp', 'email', 'address', 'number', 'neighborhood', 'city', 'state', 'zip_code',
  'website', 'instagram', 'facebook', 'youtube', 'linkedin', 'tiktok', 'other_socials', 'opening_hours',
  'commercial_info',
] as const;

export interface CompanyRow {
  id: string;
  organization_id: string;
  name: string;
  trade_name: string | null;
  legal_name: string | null;
  description: string | null;
  segment: string | null;
  reference_url: string | null;
  logo_url: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  linkedin: string | null;
  tiktok: string | null;
  other_socials: { network: string; url: string }[];
  opening_hours: string | null;
  commercial_info: Record<string, any>;
  source_meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CompanyFull extends CompanyRow {
  services: { id: string; name: string; description: string | null; benefits: string[]; details: string | null }[];
  products: { id: string; name: string; description: string | null; features: string[]; benefits: string[] }[];
  images: { id: string; url: string; type: string; alt_text: string | null; source: string; usage_allowed: boolean }[];
  testimonials: { id: string; author: string | null; text: string; source_url: string | null }[];
  landing_page: { id: string; slug: string; status: string } | null;
}

const JSON_COLUMNS = new Set(['other_socials', 'commercial_info']);
const colValue = (input: CompanyInput, col: (typeof COMPANY_COLUMNS)[number]) => {
  const v = (input as any)[col];
  return JSON_COLUMNS.has(col) ? JSON.stringify(v ?? (col === 'other_socials' ? [] : {})) : v ?? null;
};

/** Acrescenta fotos ao fim da lista da empresa (já liberadas para uso). Ignora URLs repetidas. */
export async function appendCompanyImages(orgId: string, companyId: string, images: { url: string; alt_text: string | null; source: string }[]) {
  return transaction(async (db) => {
    const owner = await db.query('select 1 from companies where id = $1 and organization_id = $2', [companyId, orgId]);
    if (!owner.rowCount) return false;
    const { rows } = await db.query<{ url: string; pos: number }>(
      'select url, position as pos from company_images where company_id = $1',
      [companyId],
    );
    const existing = new Set(rows.map((r) => r.url));
    let pos = rows.reduce((m, r) => Math.max(m, r.pos), -1);
    for (const img of images) {
      if (existing.has(img.url)) continue;
      existing.add(img.url);
      await db.query(
        `insert into company_images (company_id, url, type, alt_text, source, usage_allowed, position) values ($1,$2,'gallery',$3,$4,true,$5)`,
        [companyId, img.url, img.alt_text, img.source, ++pos],
      );
    }
    return true;
  });
}

/** Apaga fotos do cadastro da empresa (pelo endereço). */
export async function removeCompanyImages(orgId: string, companyId: string, urls: string[]) {
  const owner = await one('select 1 from companies where id = $1 and organization_id = $2', [companyId, orgId]);
  if (!owner) return false;
  await query('delete from company_images where company_id = $1 and url = any($2::text[])', [companyId, urls]);
  return true;
}

async function replaceChildren(db: pg.PoolClient, companyId: string, input: CompanyInput) {
  await db.query('delete from company_services where company_id = $1', [companyId]);
  await db.query('delete from company_products where company_id = $1', [companyId]);
  await db.query('delete from company_images where company_id = $1', [companyId]);
  await db.query('delete from company_testimonials where company_id = $1', [companyId]);

  for (const [i, s] of input.services.entries()) {
    await db.query(
      `insert into company_services (company_id, name, description, benefits, details, position) values ($1,$2,$3,$4,$5,$6)`,
      [companyId, s.name, s.description, JSON.stringify(s.benefits), s.details, i],
    );
  }
  for (const [i, p] of input.products.entries()) {
    await db.query(
      `insert into company_products (company_id, name, description, features, benefits, position) values ($1,$2,$3,$4,$5,$6)`,
      [companyId, p.name, p.description, JSON.stringify(p.features), JSON.stringify(p.benefits), i],
    );
  }
  for (const [i, img] of input.images.entries()) {
    await db.query(
      `insert into company_images (company_id, url, type, alt_text, source, usage_allowed, position) values ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, img.url, img.type, img.alt_text, img.source, img.usage_allowed, i],
    );
  }
  for (const [i, t] of input.testimonials.entries()) {
    await db.query(
      `insert into company_testimonials (company_id, author, text, source_url, position) values ($1,$2,$3,$4,$5)`,
      [companyId, t.author, t.text, t.source_url, i],
    );
  }
}

export async function createCompany(orgId: string, userId: string, input: CompanyInput, sourceMeta: object = {}) {
  return transaction(async (db) => {
    const cols = [...COMPANY_COLUMNS, 'organization_id', 'created_by', 'source_meta'];
    const values = [...COMPANY_COLUMNS.map((c) => colValue(input, c)), orgId, userId, JSON.stringify(sourceMeta)];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query<{ id: string }>(
      `insert into companies (${cols.join(', ')}) values (${placeholders}) returning id`,
      values,
    );
    await replaceChildren(db, rows[0].id, input);
    return rows[0].id;
  });
}

export async function updateCompany(orgId: string, id: string, input: CompanyInput) {
  return transaction(async (db) => {
    const sets = COMPANY_COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const res = await db.query(`update companies set ${sets} where id = $1 and organization_id = $2`, [
      id,
      orgId,
      ...COMPANY_COLUMNS.map((c) => colValue(input, c)),
    ]);
    if (res.rowCount === 0) return false;
    await replaceChildren(db, id, input);
    return true;
  });
}

export async function deleteCompany(orgId: string, id: string) {
  const res = await query('delete from companies where id = $1 and organization_id = $2', [id, orgId]);
  return (res.rowCount ?? 0) > 0;
}

export async function getCompanyFull(orgId: string, id: string): Promise<CompanyFull | null> {
  const company = await one<CompanyRow>('select * from companies where id = $1 and organization_id = $2', [id, orgId]);
  if (!company) return null;
  return hydrate(company);
}

export async function getCompanyFullById(id: string): Promise<CompanyFull | null> {
  const company = await one<CompanyRow>('select * from companies where id = $1', [id]);
  return company ? hydrate(company) : null;
}

async function hydrate(company: CompanyRow): Promise<CompanyFull> {
  const [services, products, images, testimonials, lp] = await Promise.all([
    query('select id, name, description, benefits, details from company_services where company_id = $1 order by position', [company.id]),
    query('select id, name, description, features, benefits from company_products where company_id = $1 order by position', [company.id]),
    query('select id, url, type, alt_text, source, usage_allowed from company_images where company_id = $1 order by position', [company.id]),
    query('select id, author, text, source_url from company_testimonials where company_id = $1 order by position', [company.id]),
    one('select id, slug, status from landing_pages where company_id = $1 order by created_at limit 1', [company.id]),
  ]);
  // Dados antigos podem ter "null" escrito pela IA: nunca chegam à página nem aos formulários
  return {
    ...dropNullText({ ...company, name: undefined }),
    name: company.name,
    services: dropNullText(services.rows),
    products: dropNullText(products.rows),
    images: images.rows.map((i) => ({ ...i, alt_text: dropNullText(i.alt_text) })),
    testimonials: dropNullText(testimonials.rows),
    landing_page: lp,
  };
}

export interface CompanyFilters {
  search?: string;
  segment?: string;
  city?: string;
  status?: 'ativa' | 'inativa' | 'sem_lp';
}

export async function listCompanies(orgId: string, f: CompanyFilters) {
  const where = ['c.organization_id = $1'];
  const params: unknown[] = [orgId];
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    where.push(`(lower(c.name) like $${params.length} or lower(coalesce(c.trade_name,'')) like $${params.length})`);
  }
  if (f.segment) {
    params.push(f.segment.toLowerCase());
    where.push(`lower(c.segment) = $${params.length}`);
  }
  if (f.city) {
    params.push(f.city.toLowerCase());
    where.push(`lower(c.city) = $${params.length}`);
  }
  if (f.status === 'sem_lp') where.push('lp.id is null');
  else if (f.status) {
    params.push(f.status);
    where.push(`lp.status = $${params.length}`);
  }
  const { rows } = await query(
    `select c.id, c.name, c.segment, c.city, c.state, c.phone, c.whatsapp, c.email, c.created_at,
            lp.id as landing_page_id, lp.slug, lp.status
       from companies c
       left join lateral (
         select id, slug, status from landing_pages where company_id = c.id order by created_at limit 1
       ) lp on true
      where ${where.join(' and ')}
      order by c.created_at desc
      limit 500`,
    params,
  );
  const facets = await query<{ segment: string | null; city: string | null }>(
    `select distinct segment, city from companies where organization_id = $1`,
    [orgId],
  );
  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    items: rows,
    facets: { segments: uniq(facets.rows.map((r) => r.segment)), cities: uniq(facets.rows.map((r) => r.city)) },
  };
}

// ─── Duplicidade ────────────────────────────────────────────────────
/** Chave do link: domínio sem "www" + caminho, sem barra final, parâmetros nem fragmento. */
export function companyUrlKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '').toLowerCase();
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    // Links do Google (Maps/busca): a empresa está nos parâmetros (código do local, cid, nome), não no caminho
    if (/(^|\.)google\.[a-z.]+$/.test(host) || /^(maps\.app\.goo\.gl|share\.google|g\.page|g\.co)$/.test(host)) {
      const id = ['query_place_id', 'place_id', 'cid', 'kgmid', 'ludocid', 'query', 'q'].map((k) => u.searchParams.get(k)).find(Boolean);
      return `${host}${path}${id ? `?${id.toLowerCase()}` : ''}`;
    }
    // Links cujo identificador está nos parâmetros (WhatsApp "send?phone=", perfil do Facebook "profile.php?id=")
    const param = /(^|\.)whatsapp\.com$/.test(host) ? u.searchParams.get('phone')?.replace(/\D/g, '') : /(^|\.)facebook\.com$/.test(host) && path === '/profile.php' ? u.searchParams.get('id') : null;
    return `${host}${path}${param ? `?${param}` : ''}`;
  } catch {
    return null;
  }
}

/** Nome comparável: sem acentos, maiúsculas, pontuação, títulos (Dr./Dra.) e sufixos societários. */
export function companyNameKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(dra?|doutora?)\b\.?/g, ' ')
    .replace(/\b(ltda|me|eireli|epp|s\/?a)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return key.length >= 3 ? key : null;
}

/**
 * Empresa já cadastrada na organização com o mesmo link (endereço analisado ou site)
 * ou com o mesmo nome. Links de página inicial também batem com o site cadastrado.
 */
export async function findDuplicateCompany(
  orgId: string,
  probe: { url?: string | null; website?: string | null; name?: string | null; tradeName?: string | null },
  ignoreId?: string,
): Promise<{ id: string; name: string; reason: 'link' | 'nome' } | null> {
  const { rows } = await query<{ id: string; name: string; trade_name: string | null; reference_url: string | null; website: string | null }>(
    'select id, name, trade_name, reference_url, website from companies where organization_id = $1',
    [orgId],
  );
  const urlKeys = new Set([companyUrlKey(probe.url)].filter((k): k is string => !!k));
  // O site (origem) só conta quando é a página inicial: perfis diferentes na mesma plataforma têm a mesma origem
  const homeKeys = new Set([probe.url, probe.website].map(companyUrlKey).filter((k): k is string => !!k && !k.includes('/') && !isPlatformKey(k)));
  const nameKeys = new Set([probe.name, probe.tradeName].map(companyNameKey).filter((k): k is string => !!k));
  for (const c of rows) {
    if (c.id === ignoreId) continue;
    const ref = companyUrlKey(c.reference_url);
    const site = companyUrlKey(c.website);
    if ((ref && urlKeys.has(ref)) || (ref && !ref.includes('/') && homeKeys.has(ref)) || (site && !site.includes('/') && homeKeys.has(site) && !ref?.includes('/'))) {
      return { id: c.id, name: c.trade_name || c.name, reason: 'link' };
    }
    if ([c.name, c.trade_name].map(companyNameKey).some((k) => k && nameKeys.has(k))) {
      return { id: c.id, name: c.trade_name || c.name, reason: 'nome' };
    }
  }
  return null;
}

/**
 * Domínio de plataforma (rede social, agregador de links, mensageiro, construtor de sites): a origem é a mesma para
 * milhares de empresas, então só o link completo do perfil identifica alguém.
 */
const PLATFORM_HOST =
  /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|wa\.me|whatsapp\.com|linktr\.ee|linktree\.com|bio\.link|beacons\.ai|taplink\.cc|youtube\.com|tiktok\.com|linkedin\.com|x\.com|twitter\.com|google\.[a-z.]+|goo\.gl|g\.page|g\.co|share\.google|business\.site|wixsite\.com|wix\.com|blogspot\.com|wordpress\.com|negocio\.site|ifood\.com\.br|doctoralia\.com\.br|bit\.ly|canva\.site)$/;
const isPlatformKey = (k: string | null) => !!k && PLATFORM_HOST.test(k.split(/[/?]/)[0]);
/** Link que identifica uma única empresa: perfil/página específica, ou domínio próprio. */
const isIdentifyingKey = (k: string | null): k is string =>
  !!k &&
  (!isPlatformKey(k) ||
    // Google: só com o código do local (ou a ficha /maps/place/...); demais plataformas: com o perfil no caminho
    (/(^|\.)(google\.[a-z.]+|goo\.gl|g\.co|share\.google)$/.test(k.split(/[/?]/)[0]) ? /\?.|\/maps\/place\/./.test(k) : /[/?][^/?]/.test(k) && !/^[^/?]+\/(send|profile\.php|pages|people|groups)$/.test(k)));
/** Domínio da chave (sem caminho), só quando é domínio próprio da empresa. */
const ownDomain = (k: string | null) => (k && !isPlatformKey(k) ? k.split(/[/?]/)[0] : null);

export type RegisteredMatch = {
  id: string;
  name: string;
  /** Como foi reconhecida: mesmo link, mesmo site + nome/telefone, ou mesmo nome + telefone */
  reason: 'link' | 'site' | 'nome_telefone';
  landing_page: { id: string; slug: string; status: string } | null;
};

/**
 * Marca resultados de "Buscar empresas" já cadastrados. Só marca com evidência forte:
 * - mesmo link do perfil/site (o que foi analisado ao gerar a LP), sem contar origens de plataforma;
 * - mesmo domínio próprio E mesmo nome ou telefone (redes/franquias dividem o domínio);
 * - mesmo nome E mesmo telefone (nome igual sozinho não basta).
 */
export async function matchRegisteredCompanies(
  orgId: string,
  items: { url: string | null; website: string | null; google_url?: string | null; name: string; phone: string | null }[],
): Promise<(RegisteredMatch | null)[]> {
  const { rows } = await query<{
    id: string; name: string; trade_name: string | null; reference_url: string | null; website: string | null; phones: string | null;
    lp_id: string | null; lp_slug: string | null; lp_status: string | null;
  }>(
    `select c.id, c.name, c.trade_name, c.reference_url, c.website, concat_ws('|', c.phone, c.mobile, c.whatsapp) as phones,
            lp.id as lp_id, lp.slug as lp_slug, lp.status as lp_status
       from companies c
       left join lateral (select id, slug, status from landing_pages where company_id = c.id order by created_at desc limit 1) lp on true
      where c.organization_id = $1`,
    [orgId],
  );
  const digits = (v: string | null) => (v ?? '').replace(/\D/g, '');
  const companies = rows.map((c) => {
    const ref = companyUrlKey(c.reference_url);
    const site = companyUrlKey(c.website);
    return {
      id: c.id,
      name: c.trade_name || c.name,
      landing_page: c.lp_id ? { id: c.lp_id, slug: c.lp_slug!, status: c.lp_status! } : null,
      // O link analisado identifica a empresa; o site cadastrado costuma ser só a origem (pode ser de uma rede),
      // então conta como link exato apenas quando é um perfil em plataforma (Instagram, WhatsApp...)
      links: [ref, isPlatformKey(site) ? site : null].filter(isIdentifyingKey),
      domains: [ref, site].map(ownDomain).filter((d): d is string => !!d),
      names: [c.name, c.trade_name].map(companyNameKey).filter((k): k is string => !!k),
      phones: (c.phones ?? '').split('|').map(digits).filter((d) => d.length >= 8).map((d) => d.slice(-8)),
    };
  });
  // Nome parecido: igual, ou um contém o outro inteiro ("Clínica X" × "Clínica X - Unidade Centro")
  const sameName = (a: string, b: string) => a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
  return items.map((it) => {
    const links = [it.url, it.website, it.google_url].map(companyUrlKey).filter(isIdentifyingKey);
    const domains = [it.url, it.website].map((u) => ownDomain(companyUrlKey(u))).filter((d): d is string => !!d);
    const name = companyNameKey(it.name);
    const phone = digits(it.phone).slice(-8);
    const hasPhone = phone.length === 8;
    const nameHit = (c: (typeof companies)[number]) => !!name && c.names.some((n) => sameName(n, name));
    const phoneHit = (c: (typeof companies)[number]) => hasPhone && c.phones.includes(phone);
    let reason: RegisteredMatch['reason'] | null = null;
    const hit =
      companies.find((c) => links.some((l) => c.links.includes(l)) && (reason = 'link')) ??
      companies.find((c) => domains.some((d) => c.domains.includes(d)) && (nameHit(c) || phoneHit(c)) && (reason = 'site')) ??
      companies.find((c) => nameHit(c) && phoneHit(c) && (reason = 'nome_telefone'));
    return hit && reason ? { id: hit.id, name: hit.name, reason, landing_page: hit.landing_page } : null;
  });
}
