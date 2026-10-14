import type { ImageFocus } from './theme.js';

/**
 * Estilo próprio de cada foto (por URL), escolhido no modo "Fotos" da prévia.
 * `bw`/`bc`: borda (px, cor); `r`: cantos arredondados (px); `sh`: sombra; `fx`: filtro. Ausente = como o modelo.
 * Vale para a foto que aparece, não para o espaço dela: com zoom abaixo de 100% (foto menor que o espaço)
 * o estilo vai na própria foto e o espaço em volta fica sem fundo nem sombra.
 */
export interface ImageLook {
  bw?: number;
  bc?: string;
  r?: number;
  sh?: ImageShadow;
  fx?: ImageFilter;
}
export const IMAGE_SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
export type ImageShadow = (typeof IMAGE_SHADOWS)[number];
export const IMAGE_FILTERS = ['gray', 'sepia', 'bright', 'contrast'] as const;
export type ImageFilter = (typeof IMAGE_FILTERS)[number];

export const IMAGE_BORDER_MAX = 40;
export const IMAGE_RADIUS_MAX = 300;

const HEX = /^#[0-9a-f]{6}$/i;

function normalizeLook(v: unknown): ImageLook | null {
  if (!v || typeof v !== 'object') return null;
  const i = v as Record<string, unknown>;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);
  const out: ImageLook = {};
  const bw = num(i.bw);
  if (bw !== undefined && bw > 0) out.bw = Math.round(Math.min(IMAGE_BORDER_MAX, bw));
  if (out.bw && typeof i.bc === 'string' && HEX.test(i.bc)) out.bc = i.bc.toLowerCase();
  const r = num(i.r);
  if (r !== undefined && r >= 0) out.r = Math.round(Math.min(IMAGE_RADIUS_MAX, r));
  if (IMAGE_SHADOWS.includes(i.sh as ImageShadow)) out.sh = i.sh as ImageShadow;
  if (IMAGE_FILTERS.includes(i.fx as ImageFilter)) out.fx = i.fx as ImageFilter;
  return Object.keys(out).length ? out : null;
}

export function normalizeImageStyles(input: unknown): Record<string, ImageLook> {
  const out: Record<string, ImageLook> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [url, v] of Object.entries(input).slice(0, 300)) {
    const look = url.length <= 2048 ? normalizeLook(v) : null;
    if (look) out[url] = look;
  }
  return out;
}

const cssString = (s: string) => s.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\n\r<>]/g, '');
const SHADOW: Record<Exclude<ImageShadow, 'none'>, [number, number, number]> = {
  sm: [4, 12, 0.18],
  md: [12, 30, 0.26],
  lg: [24, 60, 0.36],
};
const FILTER: Record<ImageFilter, string> = {
  gray: 'grayscale(1)',
  sepia: 'sepia(.85)',
  bright: 'brightness(1.12) saturate(1.15)',
  contrast: 'contrast(1.2)',
};

/**
 * CSS do estilo das fotos. Mesmo CSS é gerado na prévia do editor (apps/web/src/components/landing/imageStyle.ts).
 * Foto afastada (zoom < 1): estilo na <img>, que está reduzida por `scale(z)` — as medidas são divididas por z
 * para a borda e a sombra aparecerem do tamanho escolhido.
 */
export function imageStylesCss(styles: Record<string, ImageLook> | undefined, focus: Record<string, ImageFocus> | undefined): string {
  return Object.entries(styles ?? {})
    .map(([url, l]) => {
      const z = focus?.[url]?.z ?? 1;
      const onImg = z < 1;
      const k = onImg ? 1 / z : 1;
      const n = (v: number) => `${Math.round(v * k * 100) / 100}px`;
      const decl = [
        l.bw ? `border:${n(l.bw)} solid ${l.bc ?? '#ffffff'}!important` : '',
        l.r !== undefined ? `border-radius:${n(l.r)}!important` : '',
        l.sh ? `box-shadow:${l.sh === 'none' ? 'none' : `0 ${n(SHADOW[l.sh][0])} ${n(SHADOW[l.sh][1])} rgba(0,0,0,${SHADOW[l.sh][2]})`}!important` : '',
      ].filter(Boolean);
      const img = `img[data-lp-img="${cssString(url)}"]`;
      const frame = `:has(>${img})`;
      const filter = l.fx ? `${img}{filter:${FILTER[l.fx]}}` : '';
      if (!decl.length) return filter;
      // Foto afastada: o espaço em volta não ganha fundo, sombra nem borda — só a foto
      return onImg
        ? `${frame}{background:transparent!important;box-shadow:none!important}${img}{${decl.join(';')}}${filter}`
        : `${frame}{${decl.join(';')}}${filter}`;
    })
    .join('');
}
