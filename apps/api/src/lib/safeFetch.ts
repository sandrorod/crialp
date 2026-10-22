import dns from 'node:dns';
import type { LookupAddress } from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { AppError, Messages } from './errors.js';
import { assertPublicHost, isPrivateIp } from './url.js';

/**
 * Resolução de DNS usada na própria conexão: confere de novo os endereços no momento de conectar.
 * Sem isso, um domínio que responde um IP público na checagem e um IP interno logo depois
 * (DNS rebinding) passaria por assertPublicHost.
 */
export function publicOnlyLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const blocked: NodeJS.ErrnoException = new Error(`Endereço bloqueado: ${hostname}`);
      blocked.code = 'EBLOCKEDHOST';
      return callback(blocked, '');
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** Agente HTTP das requisições a sites de terceiros (coleta e imagens): só conecta em IP público. */
export const publicAgent = new Agent({ connect: { lookup: publicOnlyLookup as never } });

/** IP literal na URL não passa pelo lookup: assertPublicHost já o confere antes de conectar. */
export const isIpLiteral = (url: URL) => net.isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0;

/** fetch de um único passo pelo publicAgent (quem chama trata os redirecionamentos e chama assertPublicHost). */
export async function fetchViaPublicAgent(url: URL, init: RequestInit, dispatcher: Dispatcher = publicAgent): Promise<Response> {
  return (await undiciFetch(url, { ...(init as object), dispatcher })) as unknown as Response;
}

/**
 * fetch para URLs de terceiros: confere o host em cada redirecionamento (no máximo `maxRedirects`)
 * e conecta pelo publicAgent. Devolve a resposta final e a URL dela.
 */
export async function fetchPublic(
  start: URL,
  init: RequestInit & { maxRedirects?: number; /** só para testes (MockAgent) */ dispatcher?: Dispatcher } = {},
): Promise<{ res: Response; url: URL }> {
  const { maxRedirects = 5, dispatcher, ...rest } = init;
  let current = start;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!['http:', 'https:'].includes(current.protocol)) throw new AppError(422, Messages.unreachable, 'BAD_REDIRECT');
    await assertPublicHost(current);
    const res = await fetchViaPublicAgent(current, { ...rest, redirect: 'manual' }, dispatcher);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return { res, url: current };
    await res.body?.cancel().catch(() => {});
    current = new URL(location, current);
  }
  throw new AppError(422, Messages.unreachable, 'TOO_MANY_REDIRECTS');
}
