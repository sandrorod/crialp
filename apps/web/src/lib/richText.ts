/**
 * Formatação de trechos do texto no editor: o mesmo formato de apps/api/src/landing/richText.ts
 *   [[b]]…[[/b]]  [[n]]…[[/n]] (sem negrito)  [[i]]…[[/i]]  [[u]]…[[/u]]  [[c=#rrggbb]]…[[/c]]  [[s=18]]…[[/s]]
 *   [[a=un|https://…]]…[[/a]] (link: u/x = sublinhado ou não; n/s = nova aba ou mesma aba)
 * `richToHtml` mostra o texto formatado; `serializeRich` lê o texto editado de volta para os códigos.
 */
const TOKEN = /\[\[(\/?)(b|n|i|u|c|s|a)(?:=(#[0-9a-fA-F]{6}|\d{1,3}|[ux][ns]\|[^\]\s"<>]{1,2000}))?\]\]/g;

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

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto com códigos → HTML seguro (o texto é escapado; só as tags da formatação entram). */
export function richToHtml(text: string): string {
  const escaped = escapeHtml(text);
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
    let at = -1;
    for (let i = stack.length - 1; i >= 0; i--)
      if (stack[i].kind === kind) {
        at = i;
        break;
      }
    if (at < 0) continue;
    const inner = stack.splice(at);
    out += inner
      .slice()
      .reverse()
      .map((t) => closeTag(t.kind))
      .join('');
    for (const t of inner.slice(1)) {
      out += t.tag;
      stack.push(t);
    }
  }
  out += escaped.slice(last);
  out += stack
    .reverse()
    .map((t) => closeTag(t.kind))
    .join('');
  return out.replace(/\n/g, '<br>');
}

function toHex(color: string): string | null {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : null;
}

const BLOCKS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

export const isLinkUrl = (href: string) => /^(https?:\/\/|mailto:|tel:)/i.test(href);
/** Caracteres que fechariam o código do link (ou o atributo) ficam codificados no endereço. */
const encodeLinkUrl = (href: string) => href.replace(/[\]\s"<>]/g, (c) => encodeURIComponent(c));

/** Endereço digitado pelo usuário → link válido (sem protocolo vira https://; e-mail vira mailto:) ou null. */
export function normalizeLinkUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (isLinkUrl(t)) return t;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(t)) return `mailto:${t}`;
  if (/^\+?[\d\s().-]{8,}$/.test(t)) return `tel:${t.replace(/[^\d+]/g, '')}`;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t)) return `https://${t}`;
  return null;
}

/** Formatação aplicada por um elemento dentro do texto editado (tags e estilos em linha). */
function formatsOf(el: HTMLElement): string[] {
  const f: string[] = [];
  const tag = el.tagName;
  const st = el.style;
  if (tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) f.push('b');
  else if (st.fontWeight === 'normal' || (st.fontWeight !== '' && Number(st.fontWeight) <= 500)) f.push('n');
  if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') f.push('i');
  if (tag === 'A') {
    const href = el.getAttribute('href');
    if (href && isLinkUrl(href))
      f.push(
        `a=${st.textDecorationLine === 'none' || st.textDecoration.startsWith('none') ? 'x' : 'u'}${el.getAttribute('target') === '_blank' ? 'n' : 's'}|${encodeLinkUrl(href)}`,
      );
  } else if (tag === 'U' || st.textDecoration.includes('underline') || st.textDecorationLine.includes('underline')) f.push('u');
  const color = (tag === 'FONT' && el.getAttribute('color')) || st.color;
  const hex = color ? toHex(color) : null;
  if (hex) f.push(`c=${hex}`);
  const size = /^(\d+(?:\.\d+)?)px$/.exec(st.fontSize);
  if (size) f.push(`s=${Math.round(Math.min(200, Math.max(6, Number(size[1]))))}`);
  return f;
}

/** Conteúdo do texto em edição → texto com códigos (o próprio elemento editado não entra). */
export function serializeRich(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    // Pelo tipo do nó (não "instanceof"): o texto editado fica no documento da prévia (iframe), que tem as próprias classes
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset?.lpUi) return;
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    // Enter no modo de edição cria <div>/<p>: vira quebra de linha
    if (BLOCKS.has(el.tagName) && !first && out && !out.endsWith('\n')) out += '\n';
    const formats = formatsOf(el);
    for (const f of formats) out += `[[${f}]]`;
    el.childNodes.forEach((c, i) => walk(c, i === 0));
    for (const f of formats.slice().reverse()) out += `[[/${f.split('=')[0]}]]`;
  };
  root.childNodes.forEach((c, i) => walk(c, i === 0));
  return (
    out
      // Mesma formatação fechada e reaberta em seguida: junta
      .replace(/\[\[\/(b|n|i|u)\]\]\[\[\1\]\]/g, '')
      // Formatação sem texto dentro
      .replace(/\[\[(b|n|i|u|c=#[0-9a-f]{6}|s=\d+|a=[^\]]+)\]\]\[\[\/(b|n|i|u|c|s|a)\]\]/g, '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
  );
}
