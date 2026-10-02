import { one, query } from '../db/pool.js';

/** Histórico de "Buscar empresas": cada pesquisa com os locais encontrados. */
export interface SavedSearch {
  id: string;
  query: string;
  center: { latitude: number; longitude: number } | null;
  page: number;
  has_more: boolean;
  results: unknown[];
  created_at: string;
  updated_at: string;
}

export async function createSearch(orgId: string, userId: string, s: { query: string; center: unknown; page: number; hasMore: boolean; results: unknown[] }) {
  const row = await one<{ id: string }>(
    `insert into lp_company_searches (organization_id, user_id, query, center, page, has_more, results)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [orgId, userId, s.query, JSON.stringify(s.center), s.page, s.hasMore, JSON.stringify(s.results)],
  );
  return row!.id;
}

/** "Buscar mais locais": acrescenta os novos locais (sem repetir) e avança a página. */
export async function appendSearch(orgId: string, id: string, s: { center: unknown; page: number; hasMore: boolean; results: { url: string | null }[] }) {
  const current = await getSearch(orgId, id);
  if (!current) return null;
  const known = new Set((current.results as { url: string | null }[]).map((r) => r.url));
  const merged = [...current.results, ...s.results.filter((r) => !known.has(r.url))];
  await query(
    `update lp_company_searches set center = $3, page = $4, has_more = $5, results = $6, updated_at = now() where id = $1 and organization_id = $2`,
    [id, orgId, JSON.stringify(s.center), s.page, s.hasMore, JSON.stringify(merged)],
  );
  return merged.length;
}

export function getSearch(orgId: string, id: string) {
  return one<SavedSearch>('select * from lp_company_searches where id = $1 and organization_id = $2', [id, orgId]);
}

export async function listSearches(orgId: string) {
  const { rows } = await query(
    `select s.id, s.query, jsonb_array_length(s.results) as count, s.created_at, s.updated_at, u.name as author
       from lp_company_searches s left join users u on u.id = s.user_id
      where s.organization_id = $1 order by s.updated_at desc limit 200`,
    [orgId],
  );
  return rows;
}

export async function deleteSearch(orgId: string, id: string) {
  const res = await query('delete from lp_company_searches where id = $1 and organization_id = $2', [id, orgId]);
  return (res.rowCount ?? 0) > 0;
}
