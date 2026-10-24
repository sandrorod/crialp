import { MOBILE_MAX } from './elementColors.js';

/**
 * Tamanho das fotos (topo, "Sobre" e galeria) arrastado na prévia, por layout e por URL da foto.
 * `w`: largura em % do espaço disponível (20–100); `h`: altura em px (80–1400). Ausente = padrão do modelo.
 * Corte pelas laterais (a foto mantém o tamanho e a parte arrastada fica escondida):
 * `iw`/`il` = largura da foto e quanto ficou escondido à esquerda (% do espaço disponível);
 * `ih`/`it` = altura da foto e quanto ficou escondido em cima (px).
 */
export interface ImageBox {
  w?: number;
  h?: number;
  iw?: number;
  il?: number;
  ih?: number;
  it?: number;
}
export interface ImageSizes {
  desktop?: Record<string, ImageBox>;
  mobile?: Record<string, ImageBox>;
}

export const IMAGE_W_MIN = 20;
export const IMAGE_H_MIN = 80;
export const IMAGE_H_MAX = 1400;
/** Largura máxima da foto cortada (% do espaço disponível) */
export const IMAGE_CROP_MAX = 1000;

function normalizeBox(v: unknown): ImageBox | null {
  if (!v || typeof v !== 'object') return null;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);
  const w = num((v as ImageBox).w);
  const h = num((v as ImageBox).h);
  const out: ImageBox = {};
  if (w !== undefined && w < 100) out.w = Math.round(Math.max(IMAGE_W_MIN, w) * 10) / 10;
  if (h !== undefined) out.h = Math.round(Math.min(IMAGE_H_MAX, Math.max(IMAGE_H_MIN, h)));
  // Corte: só vale com a foto maior que a moldura
  const bw = out.w ?? 100;
  const iw = num((v as ImageBox).iw);
  if (iw !== undefined && iw > bw) {
    out.iw = Math.round(Math.min(IMAGE_CROP_MAX, iw) * 10) / 10;
    const il = Math.min(out.iw - bw, Math.max(0, num((v as ImageBox).il) ?? 0));
    if (il > 0) out.il = Math.round(il * 10) / 10;
  }
  const ih = num((v as ImageBox).ih);
  if (out.h !== undefined && ih !== undefined && ih > out.h) {
    out.ih = Math.round(Math.min(IMAGE_H_MAX * 10, ih));
    const it = Math.min(out.ih - out.h, Math.max(0, num((v as ImageBox).it) ?? 0));
    if (it > 0) out.it = Math.round(it);
  }
  return out.w !== undefined || out.h !== undefined ? out : null;
}

function normalizeMap(input: unknown): Record<string, ImageBox> {
  const out: Record<string, ImageBox> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [url, v] of Object.entries(input).slice(0, 300)) {
    const box = url.length <= 2120 ? normalizeBox(v) : null;
    if (box) out[url] = box;
  }
  return out;
}

export function normalizeImageSizes(input: any): ImageSizes {
  const desktop = normalizeMap(input?.desktop);
  const mobile = normalizeMap(input?.mobile);
  return {
    ...(Object.keys(desktop).length ? { desktop } : {}),
    ...(Object.keys(mobile).length ? { mobile } : {}),
  };
}

/** Texto seguro dentro de uma string CSS entre aspas. */
const cssString = (s: string) => s.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\n\r<>]/g, '');

/**
 * Chave do tamanho: "<seção>|<url>" vale só para a foto naquela seção (cada seção tem o seu tamanho);
 * só "<url>" (páginas antigas) vale para a foto em qualquer seção, com prioridade menor.
 */
const SECTION_KEY = /^([a-z0-9:_-]{1,60})\|(.+)$/s;
export function imageSizeKey(section: string | undefined, url: string) {
  return section && /^[a-z0-9:_-]{1,60}$/.test(section) ? `${section}|${url}` : url;
}
function frameSelector(key: string) {
  const m = SECTION_KEY.exec(key);
  const img = (url: string) => `:has(>img[data-lp-img="${cssString(url)}"])`;
  return m ? `[data-section="${m[1]}"] ${img(m[2])}` : img(key);
}

/**
 * Foto cortada: mantém o tamanho de antes do corte e fica deslocada dentro da moldura (que esconde o resto).
 * Margem em % é relativa à largura da moldura, como a largura.
 */
function cropCss(frame: string, key: string, b: ImageBox): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const bw = b.w ?? 100;
  const decl = [
    b.iw !== undefined
      ? `width:${r((b.iw / bw) * 100)}%!important;max-width:none!important;margin-left:-${r(((b.il ?? 0) / bw) * 100)}%!important;flex:none`
      : '',
    b.ih !== undefined ? `height:${b.ih}px!important;max-height:none!important;margin-top:-${b.it ?? 0}px!important` : '',
  ]
    .filter(Boolean)
    .join(';');
  if (!decl) return '';
  const m = SECTION_KEY.exec(key);
  return `${frame}>img[data-lp-img="${cssString(m ? m[2] : key)}"]{${decl}}`;
}

/**
 * Regras aplicadas na moldura da foto (o elemento que contém o <img data-lp-img>).
 * Mesmo CSS é gerado na prévia do editor (apps/web/src/components/landing/previewTools.ts).
 */
export function imageSizesCss(s: ImageSizes | undefined): string {
  const rules = (map: Record<string, ImageBox> = {}) =>
    Object.entries(map)
      .map(([url, b]) => {
        const decl = [
          // !important: vence as proporções fixas de cada modelo (ex.: foto quadrada, capa em tela cheia)
          b.w !== undefined ? `width:${b.w}%!important;max-width:100%!important;margin-left:auto!important;margin-right:auto!important` : '',
          b.h !== undefined ? `height:${b.h}px!important;aspect-ratio:auto!important;min-height:0!important;align-self:start` : '',
        ]
          .filter(Boolean)
          .join(';');
        const frame = frameSelector(url);
        return (decl ? `${frame}{${decl}}` : '') + cropCss(frame, url, b);
      })
      .join('');
  const desktop = rules(s?.desktop);
  const mobile = rules(s?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}
