/**
 * Formatação de trechos do texto (negrito, itálico, sublinhado, cor e tamanho de uma parte selecionada no editor).
 * O texto continua sendo texto: a formatação fica em códigos que o React escapa como texto comum
 *   [[b]]…[[/b]]  [[n]]…[[/n]] (sem negrito)  [[i]]…[[/i]]  [[u]]…[[/u]]  [[c=#rrggbb]]…[[/c]]  [[s=18]]…[[/s]]
 *   [[a=un|https://…]]…[[/a]] (link: u/x = sublinhado ou não; n/s = nova aba ou mesma aba)
 * e só aqui, no HTML final, viram tags — com valores validados (cor hexadecimal, tamanho numérico).
 * Dentro de atributos, <title>, <script> e <style> os códigos são apenas removidos.
 * Mantenha igual a apps/web/src/lib/richText.ts.
 */
const TOKEN = /\[\[(\/?)(b|n|i|u|c|s|a)(?:=(#[0-9a-fA-F]{6}|\d{1,3}|[ux][ns]\|[^\]\s"<>]{1,2000}))?\]\]/g;
const RAW_TAGS = new Set(['title', 'script', 'style', 'textarea']);

export function hasRich(text: string | null | undefined): boolean {
  return !!text && /\[\[\/?(?:b|n|i|u|c|s|a)(?:=[^\]]*)?\]\]/.test(text);
}

/** Texto sem os códigos de formatação (para atributos, SEO e textos que não aceitam formatação). */
export function stripRich(text: string): string {
  return text.replace(TOKEN, '');
}

function openTag(kind: string, value: string | undefined): string | null {
  if (kind === 'b') return '<strong>';
  // Trecho sem negrito dentro de um texto que é negrito (ex.: título)
  if (kind === 'n') return '<span style="font-weight:400">';
  if (kind === 'i') return '<em>';
  if (kind === 'u') return '<u>';
  if (kind === 'c') return value && /^#[0-9a-fA-F]{6}$/.test(value) ? `<span style="color:${value.toLowerCase()}">` : null;
  if (kind === 's') {
    const n = Number(value);
    return Number.isFinite(n) && n >= 6 && n <= 200 ? `<span style="font-size:${n}px">` : null;
  }
  if (kind === 'a') return linkTag(value);
  return null;
}
const closeTag = (kind: string) => (kind === 'b' ? '</strong>' : kind === 'i' ? '</em>' : kind === 'u' ? '</u>' : kind === 'a' ? '</a>' : '</span>');

/** Link externo: só http(s), e-mail e telefone. O endereço chega já escapado (&amp;), pronto para o atributo. */
function linkTag(value: string | undefined): string | null {
  const m = value ? /^([ux])([ns])\|(.+)$/.exec(value) : null;
  if (!m) return null;
  const [, underline, tab, href] = m;
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(href.replace(/&amp;/g, '&'))) return null;
  const target = tab === 'n' ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${href}"${target} style="text-decoration:${underline === 'u' ? 'underline' : 'none'};color:inherit">`;
}

/** Converte os códigos de um trecho de texto (já escapado) em tags, sempre bem fechadas. */
export function richSegment(escaped: string): string {
  const stack: { kind: string; tag: string }[] = [];
  let out = '';
  let last = 0;
  for (const m of escaped.matchAll(TOKEN)) {
    out += escaped.slice(last, m.index);
    last = m.index! + m[0].length;
    const [, slash, kind, value] = m;
    if (!slash) {
      const tag = openTag(kind, value);
      if (tag) {
        out += tag;
        stack.push({ kind, tag });
      }
      continue;
    }
    // Fecha até a última abertura do mesmo tipo e reabre as que estavam por dentro (fechamento sem abertura: ignorado)
    let at = -1;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === kind) { at = i; break; }
    if (at < 0) continue;
    const inner = stack.splice(at);
    out += inner.slice().reverse().map((t) => closeTag(t.kind)).join('');
    for (const t of inner.slice(1)) {
      out += t.tag;
      stack.push(t);
    }
  }
  out += escaped.slice(last);
  out += stack.reverse().map((t) => closeTag(t.kind)).join('');
  return out;
}

/** Aplica a formatação no HTML final da página: só no texto visível; em atributos e textos brutos, remove os códigos. */
export function applyRichText(html: string): string {
  if (!html.includes('[[')) return html;
  const parts = html.split(/(<[^>]*>)/);
  let raw: string | null = null;
  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        const m = /^<(\/?)([a-zA-Z0-9]+)/.exec(part);
        if (m) {
          const name = m[2].toLowerCase();
          if (!m[1] && RAW_TAGS.has(name) && !part.endsWith('/>')) raw = name;
          else if (m[1] && raw === name) raw = null;
        }
        return part.includes('[[') ? stripRich(part) : part;
      }
      if (!part.includes('[[')) return part;
      return raw ? stripRich(part) : richSegment(part);
    })
    .join('');
}
