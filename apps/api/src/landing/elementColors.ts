import { isHex } from './theme.js';

/** Cor escolhida para um elemento clicado na prévia do editor. */
export interface ElementColor {
  /** Cor do texto (fonte) */
  text?: string;
  /** Cor de fundo */
  bg?: string;
  /** Tamanho da fonte em px */
  size?: number;
}

/** Cores por elemento, separadas por layout: celular (até 767px) e computador. */
export interface ElementColors {
  desktop: Record<string, ElementColor>;
  mobile: Record<string, ElementColor>;
}

export const MOBILE_MAX = 767;

/**
 * Seletores gerados pelo editor: segmentos "tag.classe:nth-child(n)" ou [data-section="…"]
 * ligados por ">". A gramática fechada impede injetar CSS (sem chaves, ponto e vírgula, @ etc.).
 */
const SEGMENT_RE = /^(?:\[data-section="[a-z0-9:_-]{1,60}"\]|[a-z][a-z0-9]{0,15}(?:\.[A-Za-z0-9_-]{1,60}){0,6}(?::nth-child\(\d{1,3}\))?)$/;

export function isElementSelector(sel: unknown): sel is string {
  return typeof sel === 'string' && sel.length <= 600 && sel.split('>').every((s) => SEGMENT_RE.test(s));
}

const hex = (v: unknown) => (isHex(v) ? (String(v).startsWith('#') ? String(v) : `#${v}`).toLowerCase() : null);

function normalizeMap(input: unknown): Record<string, ElementColor> {
  const out: Record<string, ElementColor> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [sel, value] of Object.entries(input as Record<string, ElementColor>).slice(0, 300)) {
    if (!isElementSelector(sel)) continue;
    const text = hex(value?.text);
    const bg = hex(value?.bg);
    const raw = Number(value?.size);
    const size = Number.isFinite(raw) && raw > 0 ? Math.round(Math.min(200, Math.max(6, raw))) : null;
    if (text || bg || size) out[sel] = { ...(text ? { text } : {}), ...(bg ? { bg } : {}), ...(size ? { size } : {}) };
  }
  return out;
}

export function normalizeElementColors(input: unknown): ElementColors {
  const i = (input ?? {}) as Partial<ElementColors>;
  return { desktop: normalizeMap(i.desktop), mobile: normalizeMap(i.mobile) };
}

function rules(map: Record<string, ElementColor>) {
  return Object.entries(map)
    .map(([sel, c]) => {
      const decl = [
        c.text ? `color:${c.text}!important` : '',
        c.bg ? `background-color:${c.bg}!important` : '',
        c.size ? `font-size:${c.size}px!important` : '',
      ]
        .filter(Boolean)
        .join(';');
      return decl ? `${sel}{${decl}}` : '';
    })
    .join('');
}

/** CSS das cores e tamanhos por elemento; o layout de celular e o de computador são independentes. */
export function elementColorsCss(colors: ElementColors): string {
  const desktop = rules(colors.desktop);
  const mobile = rules(colors.mobile);
  return [
    desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '',
    mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : '',
  ].join('');
}
