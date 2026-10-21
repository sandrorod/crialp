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
/**
 * Mesmo CSS da página publicada (apps/api/src/landing/imageStyle.ts).
 * Giro (90° em 90°) e espelhamento da foto: transform na própria <img>, a partir do centro, somado ao zoom
 * do enquadramento (que vai junto, pois o !important substitui o transform do zoom no atributo style).
 * Girada de lado (90°/270°), a foto é ampliada por --lp-rk (maior lado ÷ menor lado do espaço, calculado
 * pelo script da página) para continuar cobrindo o espaço todo, sem faixas vazias.
 */
function orientCss(img: string, l: ImageLook, f: ImageFocus | undefined): string {
  if (!l.rot && !l.fh && !l.fv) return '';
  const k = l.rot === 90 || l.rot === 270 ? 'var(--lp-rk,1)' : '1';
  const sx = l.fh ? `calc(${k} * -1)` : k;
  const sy = l.fv ? `calc(${k} * -1)` : k;
  const zoom = f?.z && f.z !== 1 ? ` translate(${f.x}%,${f.y}%) scale(${f.z}) translate(-${f.x}%,-${f.y}%)` : '';
  return `${img}{transform-origin:0 0!important;transform:translate(50%,50%) rotate(${l.rot ?? 0}deg) scale(${sx},${sy}) translate(-50%,-50%)${zoom}!important}`;
}

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
        l.href && l.lb ? `outline:${n(3)} solid var(--primary,#2563eb)!important;outline-offset:${n(3)}!important` : '',
      ].filter(Boolean);
      const img = `img[data-lp-img="${cssString(url)}"]`;
      const frame = `:has(>${img})`;
      const filter = (l.fx ? `${img}{filter:${FILTER[l.fx]}}` : '') + orientCss(img, l, focus?.[url]);
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
