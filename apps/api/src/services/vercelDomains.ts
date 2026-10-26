import { env } from '../config/env.js';

/**
 * Domínios próprios das LPs na Vercel. Na Vercel não há "IP do servidor": o domínio raiz aponta para o IP
 * fixo de domínios dela (registro A) e subdomínios (www) para cname.vercel-dns.com. Além do DNS, o domínio
 * precisa estar adicionado ao projeto; com VERCEL_API_TOKEN isso é feito pela API, e o HTTPS sai sozinho.
 */
export const VERCEL_A = '76.76.21.21';
export const VERCEL_CNAME = 'cname.vercel-dns.com';

/** Sufixos de dois níveis comuns no Brasil (empresa.com.br é raiz; www.empresa.com.br não). */
const TWO_LEVEL = /\.(com|net|org|ind|adv|arq|eng|med|odo|vet|psi|tur|eco|edu|gov|art|blog|esp|imb|inf|rec|srv|tmp|log|app|dev)\.br$/i;
export function isApexDomain(domain: string) {
  const labels = domain.split('.').length;
  return labels <= (TWO_LEVEL.test(domain) ? 3 : 2);
}

/** Registros que o cliente deve criar no DNS para este domínio. */
export function expectedRecords(domain: string, rec?: { a?: string; cname?: string }) {
  const apex = isApexDomain(domain);
  const sub = apex ? null : domain.split('.')[0];
  return apex
    ? { kind: 'apex' as const, type: 'A' as const, name: '@', value: rec?.a ?? VERCEL_A }
    : { kind: 'sub' as const, type: 'CNAME' as const, name: sub!, value: rec?.cname ?? VERCEL_CNAME };
}

export const vercelConfigured = () => !!env.vercel.token;

async function call(method: string, path: string, body?: unknown) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (env.vercel.teamId) url.searchParams.set('teamId', env.vercel.teamId);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${env.vercel.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return { status: res?.status ?? 0, data: data as any };
}

/** Adiciona o domínio ao projeto (já adicionado a ele conta como sucesso). Devolve o erro legível, se houver. */
export async function addProjectDomain(domain: string): Promise<string | null> {
  if (!vercelConfigured()) return null;
  const r = await call('POST', `/v10/projects/${encodeURIComponent(env.vercel.projectId)}/domains`, { name: domain });
  if (r.status === 200 || r.status === 201) return null;
  // Já existe: vale se for neste projeto; em outro projeto a Vercel não deixa usar
  if (r.status === 409) {
    const mine = await call('GET', `/v9/projects/${encodeURIComponent(env.vercel.projectId)}/domains/${encodeURIComponent(domain)}`);
    return mine.status === 200 ? null : 'Este domínio já está em outro projeto da Vercel. Remova-o de lá primeiro.';
  }
  if (r.status === 401 || r.status === 403) return 'O token da Vercel foi recusado (confira VERCEL_API_TOKEN e VERCEL_TEAM_ID).';
  return `A Vercel não adicionou o domínio (${r.status || 'sem resposta'}${r.data?.error?.message ? `: ${String(r.data.error.message).slice(0, 160)}` : ''}).`;
}

/** Tira o domínio antigo do projeto quando a LP troca de domínio (melhor esforço). */
export async function removeProjectDomain(domain: string) {
  if (!vercelConfigured()) return;
  await call('DELETE', `/v9/projects/${encodeURIComponent(env.vercel.projectId)}/domains/${encodeURIComponent(domain)}`);
}

/** Situação do DNS pela Vercel: se está certo e quais valores ela recomenda para este domínio. */
export async function domainConfig(domain: string): Promise<{ ok: boolean; a?: string; cname?: string } | null> {
  if (!vercelConfigured()) return null;
  const r = await call('GET', `/v6/domains/${encodeURIComponent(domain)}/config`);
  if (r.status !== 200 || !r.data) return null;
  const pick = (list: unknown) => {
    const first = Array.isArray(list) ? [...list].sort((x: any, y: any) => (x?.rank ?? 0) - (y?.rank ?? 0))[0] : null;
    const v = (first as any)?.value;
    return Array.isArray(v) ? String(v[0] ?? '') || undefined : typeof v === 'string' ? v.replace(/\.$/, '') : undefined;
  };
  return { ok: r.data.misconfigured === false, a: pick(r.data.recommendedIPv4), cname: pick(r.data.recommendedCNAME) };
}
