import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError, Messages } from './errors.js';

/** Aceita "empresa.com.br" ou "https://empresa.com.br" e devolve uma URL http(s) válida. */
export function normalizeInputUrl(raw: string): URL {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > 2048) throw new AppError(400, Messages.invalidUrl, 'INVALID_URL');
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new AppError(400, Messages.invalidUrl, 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(400, Messages.invalidUrl, 'INVALID_URL');
  if (!url.hostname.includes('.') && !net.isIP(url.hostname)) throw new AppError(400, Messages.invalidUrl, 'INVALID_URL');
  if (url.username || url.password) throw new AppError(400, Messages.invalidUrl, 'INVALID_URL');
  url.hash = '';
  return url;
}

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice(7));
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

/**
 * Proteção contra SSRF: o servidor acessa URLs informadas pelo usuário,
 * então bloqueamos endereços internos (localhost, rede privada, metadata de nuvem).
 */
export async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new AppError(400, Messages.unreachable, 'BLOCKED_HOST');
  }
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new AppError(422, Messages.unreachable, 'DNS_FAILED');
  if (addresses.some(isPrivateIp)) throw new AppError(400, Messages.unreachable, 'BLOCKED_HOST');
}

export function sameSite(a: URL, b: URL) {
  const strip = (h: string) => h.replace(/^www\./, '');
  return strip(a.hostname) === strip(b.hostname);
}
