/**
 * Mensagens prontas do WhatsApp: "/atalho" digitado no campo de mensagem puxa o texto salvo.
 * A barra só vale no começo de uma palavra (início do texto, depois de espaço ou quebra de linha),
 * para não confundir com datas ("10/12") ou links.
 */

/** Atalho sendo digitado antes do cursor: posição da "/" e o que vem depois dela (minúsculo). */
export function shortcutAt(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const m = /(^|\s)\/([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2].toLowerCase() };
}

/** Mensagens cujo atalho começa com o que foi digitado (as que só contêm vêm depois). */
export function matchQuickReplies<T extends { shortcut: string }>(list: T[], query: string, limit = 6): T[] {
  const q = query.toLowerCase();
  const starts = list.filter((r) => r.shortcut.startsWith(q));
  const contains = q ? list.filter((r) => !r.shortcut.startsWith(q) && r.shortcut.includes(q)) : [];
  return [...starts, ...contains].slice(0, limit);
}

/** Troca o "/atalho" (de `start` até o cursor) pelo texto da mensagem; devolve o texto novo e onde fica o cursor. */
export function applyQuickReply(text: string, start: number, cursor: number, body: string): { text: string; cursor: number } {
  const next = text.slice(0, start) + body + text.slice(cursor);
  return { text: next, cursor: start + body.length };
}
