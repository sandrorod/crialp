import { MOBILE_MAX } from './elementColors.js';

/**
 * Tamanho das fotos (topo, "Sobre" e galeria) arrastado na prévia, por layout e por URL da foto.
 * `w`: largura em % do espaço disponível (20–100); `h`: altura em px (80–1400). Ausente = padrão do modelo.
 */
export interface ImageBox {
  w?: number;
  h?: number;
}
export interface ImageSizes {
  desktop?: Record<string, ImageBox>;
  mobile?: Record<string, ImageBox>;
}

export const IMAGE_W_MIN = 20;
export const IMAGE_H_MIN = 80;
export const IMAGE_H_MAX = 1400;

function normalizeBox(v: unknown): ImageBox | null {
  if (!v || typeof v !== 'object') return null;
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);
  const w = num((v as ImageBox).w);
  const h = num((v as ImageBox).h);
  const out: ImageBox = {};
  if (w !== undefined && w < 100) out.w = Math.round(Math.max(IMAGE_W_MIN, w) * 10) / 10;
  if (h !== undefined) out.h = Math.round(Math.min(IMAGE_H_MAX, Math.max(IMAGE_H_MIN, h)));
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
        ].filter(Boolean).join(';');
        return decl ? `${frameSelector(url)}{${decl}}` : '';
      })
      .join('');
  const desktop = rules(s?.desktop);
  const mobile = rules(s?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}
