export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('pt-BR', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function relativeTime(value: string) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)} dia(s)`;
  return formatDate(value);
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Remove chaves de UI e normaliza strings vazias antes de enviar ao backend. */
export function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'string' && !v.trim() ? null : v;
  return out as T;
}

/** Link curto para exibição: sem protocolo/www e, se longo, com "…" no meio (o link completo fica no href/title). */
export function shortUrl(url: string | null | undefined, max = 48): string {
  if (!url) return '';
  let text = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  try {
    const u = new URL(url);
    // Links do Google Maps ficam enormes: mostra só o que identifica
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname.startsWith('/maps')) return 'Google Maps' + (u.searchParams.get('query') ? ` · ${decodeURIComponent(u.searchParams.get('query')!).split(',')[0]}` : '');
    text = decodeURIComponent(text);
  } catch {
    /* mantém o texto como veio */
  }
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.65);
  return `${text.slice(0, head)}…${text.slice(-(max - 1 - head))}`;
}
