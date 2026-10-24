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

// Faixas que o servidor nunca acessa: loopback, redes privadas, link-local (metadata de nuvem
// 169.254.169.254 e fd00:ec2::254), CGNAT, multicast, reservadas e de documentação/testes.
const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOCKED.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96] /* IPv4-compatível (obsoleto) */,
  ['64:ff9b::', 96] /* NAT64 */,
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16] /* 6to4 */,
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  BLOCKED.addSubnet(addr, prefix, 'ipv6');

/** IPv4 embutido num IPv6 "mapeado" (::ffff:7f00:1 ou ::ffff:127.0.0.1), como a URL normaliza. */
function mappedIPv4(ip: string): string | null {
  const m = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(ip) ?? /^::ffff:(.+)$/i.exec(ip);
  if (!m) return null;
  const rest = m[1];
  if (net.isIPv4(rest)) return rest;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (net.isIPv4(addr)) return BLOCKED.check(addr, 'ipv4');
  if (!net.isIPv6(addr)) return true; // formato desconhecido: na dúvida, bloqueia
  const v4 = mappedIPv4(addr);
  if (v4) return BLOCKED.check(v4, 'ipv4');
  return BLOCKED.check(addr, 'ipv6');
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
