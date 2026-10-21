import type { ImageFocus } from './theme.js';

/**
 * Estilo próprio de cada foto (por URL), escolhido no modo "Fotos" da prévia.
 * `bw`/`bc`: borda (px, cor); `r`: cantos arredondados (px); `sh`: sombra; `fx`: filtro;
 * `rot`: giro (90/180/270°); `fh`/`fv`: espelhada na horizontal/vertical. Ausente = como o modelo.
 * Vale para a foto que aparece, não para o espaço dela: com zoom abaixo de 100% (foto menor que o espaço)
 * o estilo vai na própria foto e o espaço em volta fica sem fundo nem sombra.
 */
export interface ImageLook {
  bw?: number;
  bc?: string;
  r?: number;
  sh?: ImageShadow;
  fx?: ImageFilter;
  rot?: ImageRotation;
  fh?: true;
  fv?: true;
  /** Link externo ao clicar na foto; `nt`: abre em nova aba; `lb`: borda na cor da página indicando o link */
  href?: string;
  nt?: true;
  lb?: true;
}
export const IMAGE_ROTATIONS = [90, 180, 270] as const;
export type ImageRotation = (typeof IMAGE_ROTATIONS)[number];
export const IMAGE_SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
export type ImageShadow = (typeof IMAGE_SHADOWS)[number];
export const IMAGE_FILTERS = ['gray', 'sepia', 'bright', 'contrast'] as const;
export type ImageFilter = (typeof IMAGE_FILTERS)[number];

export const IMAGE_BORDER_MAX = 40;
export const IMAGE_RADIUS_MAX = 300;

const HEX = /^#[0-9a-f]{6}$/i;

/** Link de foto: só http(s), e-mail e telefone, sem espaços. */
export const isImageLink = (href: string) => href.length <= 2048 && /^(https?:\/\/|mailto:|tel:)\S+$/i.test(href);

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
  if (IMAGE_ROTATIONS.includes(i.rot as ImageRotation)) out.rot = i.rot as ImageRotation;
  if (i.fh === true) out.fh = true;
  if (i.fv === true) out.fv = true;
  if (typeof i.href === 'string' && isImageLink(i.href)) {
    out.href = i.href;
    if (i.nt === true) out.nt = true;
    if (i.lb === true) out.lb = true;
  }
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
        l.href && l.lb ? `outline:${n(3)} solid var(--primary,#2563eb)!important;outline-offset:${n(3)}!important` : '',
      ].filter(Boolean);
      const img = `img[data-lp-img="${cssString(url)}"]`;
      const frame = `:has(>${img})`;
      const filter = (l.fx ? `${img}{filter:${FILTER[l.fx]}}` : '') + orientCss(img, l, focus?.[url]) + (l.href ? `${img}{cursor:pointer}` : '');
      if (!decl.length) return filter;
      // Foto afastada: o espaço em volta não ganha fundo, sombra nem borda — só a foto
      return onImg
        ? `${frame}{background:transparent!important;box-shadow:none!important}${img}{${decl.join(';')}}${filter}`
        : `${frame}{${decl.join(';')}}${filter}`;
    })
    .join('');
}

/**
 * Links das fotos para o script da página publicada: [[url da foto, link, nova aba]].
 * O clique é tratado por script (sem envolver a foto num <a>), para não mudar o layout do modelo.
 */
export function imageLinksJson(styles: Record<string, ImageLook> | undefined): string | null {
  const list = Object.entries(styles ?? {})
    .filter(([, l]) => l.href)
    .map(([url, l]) => [url, l.href, l.nt ? 1 : 0]);
  // Evita fechar a tag <script> dentro do JSON
  return list.length ? JSON.stringify(list).replace(/</g, '\\u003c') : null;
}

/** Foto com link: clique (mesmo com algo por cima, como legenda) e teclado abrem o link. */
export const IMAGE_LINKS_SCRIPT = `(function(){var j=document.getElementById('lp-links');if(!j)return;var M={};try{JSON.parse(j.textContent).forEach(function(x){M[x[0]]=x})}catch(_){return}function go(x){if(x[2])window.open(x[1],'_blank','noopener');else location.href=x[1]}function find(e){var l=document.elementsFromPoint?document.elementsFromPoint(e.clientX,e.clientY):[e.target];for(var i=0;i<l.length;i++){var n=l[i];if(n.closest&&n.closest('a,button,summary,input,textarea,select'))return null;if(n.tagName==='IMG'&&M[n.getAttribute('data-lp-img')])return M[n.getAttribute('data-lp-img')]}return null}document.addEventListener('click',function(e){var x=find(e);if(x){e.preventDefault();go(x)}});document.querySelectorAll('img[data-lp-img]').forEach(function(i){var x=M[i.getAttribute('data-lp-img')];if(!x)return;i.setAttribute('role','link');i.setAttribute('tabindex','0');i.addEventListener('keydown',function(e){if(e.key==='Enter')go(x)})})})();`;
