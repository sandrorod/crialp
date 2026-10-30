import { detectImageType, storage } from '../storage/StorageService.js';

/** Fotos trazidas do Instagram por empresa */
export const INSTAGRAM_PHOTOS = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
/** Só baixa dos servidores de imagem do próprio Instagram/Facebook */
const MEDIA_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
/** Caminhos do Instagram que não são perfil */
const NOT_PROFILE = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'direct', 'about', 'developer', 'legal']);
const HEADERS = {
  // Mesmo pedido que o site do Instagram faz para mostrar um perfil público
  'x-ig-app-id': '936619743392459',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

/** Usuário do Instagram a partir do link (instagram.com/<usuario>) ou de "@usuario". */
export function instagramUsername(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const at = /^@?([a-z0-9._]{1,30})$/i.exec(v);
  if (at) return at[1].toLowerCase();
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    const first = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return first && !NOT_PROFILE.has(first) && /^[a-z0-9._]{1,30}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

interface IgNode {
  is_video?: boolean;
  display_url?: string;
  taken_at_timestamp?: number;
  accessibility_caption?: string | null;
}

/**
 * As fotos mais recentes do perfil público (sem vídeos; posts fixados entram pela data, não pelo topo).
 * Cada foto é copiada para o armazenamento do sistema: o link do Instagram expira em poucos dias.
 * Devolve o motivo quando não deu (perfil privado, Instagram recusou, sem fotos) — nunca lança erro.
 */
export async function fetchInstagramPhotos(
  profile: string,
  limit = INSTAGRAM_PHOTOS,
): Promise<{ photos: { url: string; alt_text: string | null }[]; error: string | null }> {
  const username = instagramUsername(profile);
  if (!username) return { photos: [], error: 'Link do Instagram inválido.' };
  let nodes: IgNode[];
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 200) return { photos: [], error: `O Instagram não liberou o perfil @${username} (HTTP ${res.status}).` };
    const body = (await res.json()) as { data?: { user?: { is_private?: boolean; edge_owner_to_timeline_media?: { edges?: { node: IgNode }[] } } } };
    const user = body.data?.user;
    if (!user) return { photos: [], error: `Perfil @${username} não encontrado no Instagram.` };
    if (user.is_private) return { photos: [], error: `Perfil @${username} é privado.` };
    nodes = (user.edge_owner_to_timeline_media?.edges ?? []).map((e) => e.node);
  } catch (err) {
    return { photos: [], error: `O Instagram não respondeu (${err instanceof Error ? err.message : String(err)}).` };
  }

  const recent = nodes
    .filter((n) => !n.is_video && typeof n.display_url === 'string')
    .sort((a, b) => (b.taken_at_timestamp ?? 0) - (a.taken_at_timestamp ?? 0));
  const photos: { url: string; alt_text: string | null }[] = [];
  for (const n of recent) {
    if (photos.length >= limit) break;
    const saved = await copyPhoto(n.display_url!).catch(() => null);
    if (saved) photos.push({ url: saved, alt_text: n.accessibility_caption?.slice(0, 300) || null });
  }
  return { photos, error: photos.length ? null : `Nenhuma foto encontrada no perfil @${username}.` };
}

async function copyPhoto(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !MEDIA_HOST.test(u.hostname)) return null;
  const res = await fetch(u, { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return null;
  const type = detectImageType(buf);
  if (!type || type === 'gif') return null;
  return storage.save(buf, type);
}
