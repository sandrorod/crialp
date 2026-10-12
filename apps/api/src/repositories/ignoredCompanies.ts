import { query } from '../db/pool.js';
import { companyUrlKey, ownDomain } from './companies.js';

type Item = { url?: string | null; website?: string | null; google_url?: string | null; place_id?: string | null; name?: string | null };

/** Chaves que identificam um resultado: código do local no Google, link, link do Google e domínio próprio. */
export function ignoreKeys(it: Item): string[] {
  const keys = [
    it.place_id ? `place:${it.place_id}` : null,
    ...[it.url, it.google_url].map((u) => companyUrlKey(u)).map((k) => (k ? `link:${k}` : null)),
    // Site próprio, só em resultado sem código do local (redes/franquias dividem o site entre lojas;
    // redes sociais e plataformas nunca: são de milhares de empresas)
    (() => {
      if (it.place_id) return null;
      const d = ownDomain(companyUrlKey(it.website));
      return d ? `site:${d}` : null;
    })(),
  ];
  return [...new Set(keys.filter((k): k is string => !!k))];
}

export async function ignoreCompany(orgId: string, userId: string, it: Item) {
  const keys = ignoreKeys(it);
  for (const k of keys) {
    await query(
      `insert into lp_ignored_companies (organization_id, key, name, created_by) values ($1, $2, $3, $4)
       on conflict (organization_id, key) do nothing`,
      [orgId, k, it.name ?? null, userId],
    );
  }
  return keys.length;
}

export async function unignoreCompany(orgId: string, it: Item) {
  const keys = ignoreKeys(it);
  if (keys.length) await query('delete from lp_ignored_companies where organization_id = $1 and key = any($2)', [orgId, keys]);
}

/** Resultados sem os que foram ignorados. */
export async function withoutIgnored<T extends Item>(orgId: string, items: T[]): Promise<T[]> {
  const keysOf = items.map(ignoreKeys);
  const all = [...new Set(keysOf.flat())];
  if (!all.length) return items;
  const { rows } = await query<{ key: string }>('select key from lp_ignored_companies where organization_id = $1 and key = any($2)', [orgId, all]);
  if (!rows.length) return items;
  const ignored = new Set(rows.map((r) => r.key));
  return items.filter((_, i) => !keysOf[i].some((k) => ignored.has(k)));
}
