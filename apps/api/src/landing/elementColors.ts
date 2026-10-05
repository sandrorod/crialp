import { isHex } from './theme.js';

/** Cor escolhida para um elemento clicado na prévia do editor. */
export interface ElementColor {
  /** Cor do texto (fonte) */
  text?: string;
  /** Cor de fundo */
  bg?: string;
  /** Tamanho da fonte em px */
  size?: number;
  /** Fonte escolhida (chave de TEXT_FONTS) */
  font?: string;
  /** true = negrito, false = sem negrito (ausente = padrão do modelo) */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Efeito de movimento quando o texto aparece na tela (vale para celular e computador) */
  fx?: TextEffect;
}

/** Efeitos de movimento dos textos. Mantenha igual em apps/web/src/components/landing/previewTools.ts. */
export const TEXT_EFFECTS = ['fade', 'up', 'down', 'left', 'right', 'zoom', 'bounce', 'typing', 'pulse'] as const;
export type TextEffect = (typeof TEXT_EFFECTS)[number];

/**
 * Fontes oferecidas ao editar um texto. `google` = família carregada do Google Fonts;
 * as demais já vêm instaladas nos aparelhos. Mantenha igual em apps/web/src/components/landing/previewTools.ts.
 */
export const TEXT_FONTS: Record<string, { label: string; stack: string; google?: string }> = {
  arial: { label: 'Arial', stack: 'Arial,Helvetica,sans-serif' },
  verdana: { label: 'Verdana', stack: 'Verdana,Geneva,sans-serif' },
  tahoma: { label: 'Tahoma', stack: 'Tahoma,Verdana,sans-serif' },
  trebuchet: { label: 'Trebuchet MS', stack: '"Trebuchet MS",Helvetica,sans-serif' },
  georgia: { label: 'Georgia', stack: 'Georgia,serif' },
  times: { label: 'Times New Roman', stack: '"Times New Roman",Times,serif' },
  courier: { label: 'Courier New', stack: '"Courier New",Courier,monospace' },
  roboto: { label: 'Roboto', stack: '"Roboto",sans-serif', google: 'Roboto:ital,wght@0,400;0,700;1,400;1,700' },
  opensans: { label: 'Open Sans', stack: '"Open Sans",sans-serif', google: 'Open+Sans:ital,wght@0,400;0,700;1,400;1,700' },
  montserrat: { label: 'Montserrat', stack: '"Montserrat",sans-serif', google: 'Montserrat:ital,wght@0,400;0,700;1,400;1,700' },
  poppins: { label: 'Poppins', stack: '"Poppins",sans-serif', google: 'Poppins:ital,wght@0,400;0,700;1,400;1,700' },
  lato: { label: 'Lato', stack: '"Lato",sans-serif', google: 'Lato:ital,wght@0,400;0,700;1,400;1,700' },
  oswald: { label: 'Oswald', stack: '"Oswald",sans-serif', google: 'Oswald:wght@400;700' },
  playfair: { label: 'Playfair Display', stack: '"Playfair Display",serif', google: 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700' },
  merriweather: { label: 'Merriweather', stack: '"Merriweather",serif', google: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700' },
};

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
    const font = typeof value?.font === 'string' && TEXT_FONTS[value.font] ? value.font : null;
    const flag = (v: unknown) => (typeof v === 'boolean' ? v : null);
    const entry: ElementColor = {
      ...(text ? { text } : {}),
      ...(bg ? { bg } : {}),
      ...(size ? { size } : {}),
      ...(font ? { font } : {}),
      ...(flag(value?.bold) !== null ? { bold: value.bold } : {}),
      ...(flag(value?.italic) !== null ? { italic: value.italic } : {}),
      ...(flag(value?.underline) !== null ? { underline: value.underline } : {}),
      ...(TEXT_EFFECTS.includes(value?.fx as TextEffect) ? { fx: value.fx } : {}),
    };
    if (Object.keys(entry).length) out[sel] = entry;
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
        c.font && TEXT_FONTS[c.font] ? `font-family:${TEXT_FONTS[c.font].stack}!important` : '',
        c.bold !== undefined ? `font-weight:${c.bold ? 700 : 400}!important` : '',
        c.italic !== undefined ? `font-style:${c.italic ? 'italic' : 'normal'}!important` : '',
        c.underline !== undefined ? `text-decoration:${c.underline ? 'underline' : 'none'}!important` : '',
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

/**
 * Efeitos dos textos para o script da página: [seletor, efeito, layout]. Vai num bloco JSON
 * (não executável); o script marca os elementos e toca o efeito quando entram na tela.
 */
export function textEffectsJson(colors: ElementColors): string | null {
  const list: [string, TextEffect, 'd' | 'm'][] = [];
  for (const [layout, map] of [['d', colors.desktop], ['m', colors.mobile]] as const) {
    for (const [sel, c] of Object.entries(map)) if (c.fx) list.push([sel, c.fx, layout]);
  }
  // Evita fechar a tag <script> dentro do JSON
  return list.length ? JSON.stringify(list).replace(/</g, '\\u003c') : null;
}

/** Google Fonts das fontes escolhidas nos textos (null se nenhuma precisa ser carregada). */
export function elementFontsHref(colors: ElementColors): string | null {
  const used = new Set<string>();
  for (const map of [colors.desktop, colors.mobile]) for (const c of Object.values(map)) if (c.font) used.add(c.font);
  const families = [...used].map((k) => TEXT_FONTS[k]?.google).filter(Boolean);
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap` : null;
}
