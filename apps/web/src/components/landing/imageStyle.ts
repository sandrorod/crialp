import type { ImageFocus, ImageLook } from '@/types';

const SHADOW: Record<'sm' | 'md' | 'lg', [number, number, number]> = {
  sm: [4, 12, 0.18],
  md: [12, 30, 0.26],
  lg: [24, 60, 0.36],
};
const FILTER: Record<NonNullable<ImageLook['fx']>, string> = {
  gray: 'grayscale(1)',
  sepia: 'sepia(.85)',
  bright: 'brightness(1.12) saturate(1.15)',
  contrast: 'contrast(1.2)',
};
const cssString = (v: string) => v.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\n\r<>]/g, '');

/**
 * Mesmo CSS gerado na página publicada (apps/api/src/landing/imageStyle.ts).
 * Foto afastada (zoom < 1): estilo na própria foto (medidas divididas pelo zoom) e o espaço em volta sem
 * fundo nem sombra; senão a foto ocupa o espaço todo e o estilo vai na moldura (que recorta a foto).
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
      return onImg
        ? `${frame}{background:transparent!important;box-shadow:none!important}${img}{${decl.join(';')}}${filter}`
        : `${frame}{${decl.join(';')}}${filter}`;
    })
    .join('');
}

export function setImageStyleCss(doc: Document, css: string) {
  let style = doc.getElementById('lp-image-style');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'lp-image-style';
    doc.head.appendChild(style);
  }
  style.textContent = css;
}
