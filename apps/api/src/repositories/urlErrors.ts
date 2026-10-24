import { query } from '../db/pool.js';
import { companyUrlKey } from './companies.js';

/** Análise de um link que falhou (empresa ainda não cadastrada): aparece em "Buscar empresas". */
export async function recordUrlError(orgId: string, url: string, error: string) {
  const key = companyUrlKey(url);
  if (!key) return;
  await query(
    `insert into lp_url_errors (organization_id, url_key, url, error) values ($1, $2, $3, $4)
     on conflict (organization_id, url_key) do update set url = excluded.url, error = excluded.error, created_at = now()`,
    [orgId, key, url, error],
  );
}

export async function clearUrlError(orgId: string, url: string) {
  const key = companyUrlKey(url);
  if (key) await query('delete from lp_url_errors where organization_id = $1 and url_key = $2', [orgId, key]);
}

/** Erro da última análise de cada link (na ordem dos itens; null = sem erro). */
export async function urlErrorsFor(orgId: string, urls: (string | null | undefined)[]): Promise<({ error: string; at: string } | null)[]> {
  const keys = urls.map((u) => companyUrlKey(u));
  const wanted = [...new Set(keys.filter((k): k is string => !!k))];
  if (!wanted.length) return keys.map(() => null);
  const { rows } = await query<{ url_key: string; error: string; created_at: string }>(
    'select url_key, error, created_at from lp_url_errors where organization_id = $1 and url_key = any($2)',
    [orgId, wanted],
  );
  const byKey = new Map(rows.map((r) => [r.url_key, { error: r.error, at: r.created_at }]));
  // Análises dos últimos dias (inclusive as de antes deste registro): vale o resultado da mais recente de cada link
  const { rows: jobs } = await query<{ url: string; status: string; error: string | null; created_at: string }>(
    `select input->>'url' as url, status, error, created_at from jobs
      where organization_id = $1 and type = 'analyze_url' and status in ('done', 'error') and input->>'url' is not null
      order by created_at`,
    [orgId],
  );
  const wantedSet = new Set(wanted);
  for (const j of jobs) {
    const k = companyUrlKey(j.url);
    if (!k || !wantedSet.has(k)) continue;
    const known = byKey.get(k);
    if (known && new Date(known.at) > new Date(j.created_at)) continue;
    if (j.status === 'error' && j.error && !/interrompido pelo usuário/i.test(j.error)) byKey.set(k, { error: j.error, at: j.created_at });
    else if (j.status === 'done') byKey.delete(k);
  }
  return keys.map((k) => (k ? (byKey.get(k) ?? null) : null));
}
