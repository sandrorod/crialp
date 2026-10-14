import type { ElementColor, ElementColors, ImageBox, ImageSizes, LandingContent, SectionSpacing, TextEffect } from '@/types';

/** Ferramentas ativas na prévia: enquadrar fotos, arrastar seções ou escolher cores. */
export type PreviewMode = 'textos' | 'fotos' | 'mover' | 'secoes' | 'espacos' | 'cores';

export const MOBILE_MAX = 767;

/** Fontes oferecidas ao editar um texto (iguais a TEXT_FONTS em apps/api/src/landing/elementColors.ts). */
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

/** Efeitos de movimento dos textos (iguais a TEXT_EFFECTS em apps/api/src/landing/elementColors.ts). */
export const TEXT_EFFECT_GROUPS: { title: string; items: { value: TextEffect; label: string }[] }[] = [
  {
    title: 'Entrada',
    items: [
      { value: 'fade', label: 'Surgir' },
      { value: 'up', label: 'Subir' },
      { value: 'down', label: 'Descer' },
      { value: 'left', label: 'Da esquerda' },
      { value: 'right', label: 'Da direita' },
      { value: 'zoom', label: 'Zoom' },
      { value: 'zoomout', label: 'Afastar' },
      { value: 'bounce', label: 'Quicar' },
      { value: 'blur', label: 'Desfoque' },
      { value: 'flip', label: 'Virar' },
      { value: 'rotate', label: 'Girar' },
      { value: 'swing', label: 'Balançar' },
      { value: 'expand', label: 'Expandir letras' },
      { value: 'typing', label: 'Digitação' },
    ],
  },
  { title: 'Chamar atenção', items: [{ value: 'shake', label: 'Tremer' }, { value: 'rubber', label: 'Elástico' }, { value: 'tada', label: 'Tadã' }] },
  {
    title: 'Destaque',
    items: [
      { value: 'pulse', label: 'Pulsar' },
      { value: 'heartbeat', label: 'Batimento' },
      { value: 'float', label: 'Flutuar' },
      { value: 'glow', label: 'Brilhar' },
      { value: 'blink', label: 'Piscar' },
    ],
  },
];
const EFFECT_LABEL = new Map(TEXT_EFFECT_GROUPS.flatMap((g) => g.items.map((i) => [i.value, i.label] as const)));

/** Prévia: digitação mostrada como revelação da esquerda para a direita (o texto em edição não é reescrito). */
const FX_PREVIEW_CSS =
  '[data-fx="typing"].fx-in.fx-demo{animation:lpfx-wipe calc(1.2s / var(--fx-s,1)) steps(24) both}@keyframes lpfx-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}';

/** Toca o efeito do texto na prévia (ao escolher na barra). */
export function playTextEffect(el: HTMLElement, fx: TextEffect | null) {
  const doc = el.ownerDocument;
  if (!doc.getElementById('lp-fx-preview')) {
    const style = doc.createElement('style');
    style.id = 'lp-fx-preview';
    style.textContent = FX_PREVIEW_CSS;
    doc.head.appendChild(style);
  }
  el.classList.remove('fx-in', 'fx-demo');
  if (!fx) {
    el.removeAttribute('data-fx');
    return;
  }
  el.setAttribute('data-fx', fx);
  if (doc.defaultView?.getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
  void el.offsetWidth; // reinicia a animação
  el.classList.add('fx-in', 'fx-demo');
}

/**
 * Marca na prévia os textos com efeito do layout mostrado (sem escondê-los: na prévia ficam visíveis;
 * o efeito toca ao ser escolhido na barra). Na página publicada o script da página faz isso.
 */
export function applyTextEffects(doc: Document, colors: ElementColors | undefined, device: 'desktop' | 'mobile') {
  const wanted = new Map<HTMLElement, TextEffect>();
  for (const [sel, c] of Object.entries(colors?.[device] ?? {})) {
    if (!c.fx) continue;
    try {
      doc.querySelectorAll<HTMLElement>(sel).forEach((el) => wanted.set(el, c.fx!));
    } catch {
      /* seletor inválido: ignora */
    }
  }
  doc.querySelectorAll<HTMLElement>('[data-fx]').forEach((el) => {
    if (wanted.has(el)) return;
    el.removeAttribute('data-fx');
    el.classList.remove('fx-in', 'fx-demo', 'fx-typing');
  });
  // Quem já está com o mesmo efeito fica como está (não interrompe a animação que acabou de tocar)
  for (const [el, fx] of wanted) {
    if (el.getAttribute('data-fx') === fx) continue;
    el.setAttribute('data-fx', fx);
    el.classList.add('fx-in');
  }
}

/** Declarações CSS de um elemento (mesma regra da página publicada). */
export function elementStyleDecl(c: ElementColor): string {
  return [
    c.text ? `color:${c.text}!important` : '',
    c.bg ? `background-color:${c.bg}!important` : '',
    c.size ? `font-size:${c.size}px!important` : '',
    c.font && TEXT_FONTS[c.font] ? `font-family:${TEXT_FONTS[c.font].stack}!important` : '',
    c.bold !== undefined ? `font-weight:${c.bold ? 700 : 400}!important` : '',
    c.italic !== undefined ? `font-style:${c.italic ? 'italic' : 'normal'}!important` : '',
    c.underline !== undefined ? `text-decoration:${c.underline ? 'underline' : 'none'}!important` : '',
    // Na prévia o elemento excluído continua visível (apagado e tracejado) para poder ser restaurado;
    // na página publicada ele some (display:none, em apps/api/src/landing/elementColors.ts)
    c.hidden ? 'opacity:.3!important;outline:2px dashed #ef4444!important;outline-offset:2px' : '',
    c.fxSpeed ? `--fx-s:${c.fxSpeed}` : '',
    c.mx || c.my ? `translate:${c.mx ?? 0}px ${c.my ?? 0}px` : '',
    c.w ? `max-width:${c.w}%!important${c.wc ? ';margin-left:auto!important;margin-right:auto!important' : ''}` : '',
  ]
    .filter(Boolean)
    .join(';');
}

/** Carrega na prévia a fonte do Google escolhida (a página publicada já traz o link). */
export function loadTextFont(doc: Document, key: string | undefined) {
  const f = key ? TEXT_FONTS[key] : undefined;
  if (!f?.google || doc.querySelector(`link[data-lp-font="${key}"]`)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  link.dataset.lpFont = key;
  doc.head.appendChild(link);
}

/** Carrega na prévia todas as fontes escolhidas nos textos. */
export function loadElementFonts(doc: Document, colors: ElementColors | undefined) {
  for (const map of [colors?.desktop, colors?.mobile]) for (const c of Object.values(map ?? {})) loadTextFont(doc, c.font);
}

/** Mesmo CSS gerado na página publicada (apps/api/src/landing/elementColors.ts). */
export function elementColorsCss(colors: ElementColors | undefined): string {
  const rules = (map: Record<string, ElementColor> = {}) =>
    Object.entries(map)
      .map(([sel, c]) => {
        const decl = elementStyleDecl(c);
        return decl ? `${sel}{${decl}}` : '';
      })
      .join('');
  const desktop = rules(colors?.desktop);
  const mobile = rules(colors?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}

/** Escala base das margens das seções em todos os modelos (apps/api/src/landing/styles.ts). */
const SPACING_BASE = 0.85;
const spacingScale = (pct: number) => +((SPACING_BASE * pct) / 100).toFixed(4);

/** Mesmo CSS gerado na página publicada (apps/api/src/landing/spacing.ts). */

/** Mesmas regras de apps/api/src/landing/spacing.ts. Largura de títulos e textos (% da área de cada um): faixa mais estreita, mesma letra. */
export const TEXT_WIDTH_MIN = 40;
const TITLE_SEL = '.hero h1,.section-head h2,.final h2,.custom-text h3,.blk-heading h3';
const TEXT_SEL = '.hero .sub,.hero p,.section-head .lead,.about-text p,.custom-text p,.blk-text p,.final p';
// Onde o modelo centraliza o texto, a faixa mais estreita continua no meio
const CENTERED_SEL = [
  '.hero-centered', '.section-head.center', '.final', '.custom-center', '.tpl-elegante .hero-split .container',
  ...['aurora', 'elegante', 'moderno', 'organico'].map((t) => `.tpl-${t} .section>.container>.section-head`),
].map((c) => `${c} :is(h1,h2,h3,p,.lead,.sub)`).join(',');
function textWidthRules(title: number | undefined, text: number | undefined) {
  if (!title && !text) return '';
  return (
    (title ? `:is(${TITLE_SEL}){max-width:${title}%!important}` : '') +
    (text ? `:is(${TEXT_SEL}){max-width:${text}%!important}` : '') +
    `:is(${CENTERED_SEL}){margin-left:auto;margin-right:auto}`
  );
}

export function sectionSpacingCss(s: SectionSpacing | undefined): string {
  const layout = (pct: number | undefined, map: Record<string, number> = {}) =>
    (pct && pct < 100 ? `:root{--section-y-scale:${spacingScale(pct)}}` : '') +
    Object.entries(map)
      .map(([k, v]) => `[data-section="${k}"]{--section-y-scale:${spacingScale(v)}}`)
      .join('');
  const desktop = layout(s?.desktop, s?.sections?.desktop) + textWidthRules(s?.titleWidth?.desktop, s?.textWidth?.desktop);
  const mobile = layout(s?.mobile, s?.sections?.mobile) + textWidthRules(s?.titleWidth?.mobile, s?.textWidth?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}

// ─── Tamanho das fotos ──────────────────────────────────────────────
const IMG_W_MIN = 20;
const IMG_H_MIN = 80;
const IMG_H_MAX = 1400;
const cssString = (v: string) => v.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\n\r<>]/g, '');

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

/** Foto cortada: mantém o tamanho de antes do corte, deslocada dentro da moldura (igual a apps/api/src/landing/imageSize.ts). */
function cropDecl(b: ImageBox): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const bw = b.w ?? 100;
  return [
    b.iw !== undefined ? `width:${r((b.iw / bw) * 100)}%!important;max-width:none!important;margin-left:-${r(((b.il ?? 0) / bw) * 100)}%!important;flex:none` : '',
    b.ih !== undefined ? `height:${b.ih}px!important;max-height:none!important;margin-top:-${b.it ?? 0}px!important` : '',
  ].filter(Boolean).join(';');
}
function cropCss(frame: string, key: string, b: ImageBox): string {
  const decl = cropDecl(b);
  if (!decl) return '';
  const m = SECTION_KEY.exec(key);
  return `${frame}>img[data-lp-img="${cssString(m ? m[2] : key)}"]{${decl}}`;
}

/** Mesmo CSS gerado na página publicada (apps/api/src/landing/imageSize.ts). */
export function imageSizesCss(s: ImageSizes | undefined): string {
  const rules = (map: Record<string, ImageBox> = {}) =>
    Object.entries(map)
      .map(([url, b]) => {
        const decl = [
          b.w !== undefined ? `width:${b.w}%!important;max-width:100%!important;margin-left:auto!important;margin-right:auto!important` : '',
          b.h !== undefined ? `height:${b.h}px!important;aspect-ratio:auto!important;min-height:0!important;align-self:start` : '',
        ].filter(Boolean).join(';');
        const frame = frameSelector(url);
        return (decl ? `${frame}{${decl}}` : '') + cropCss(frame, url, b);
      })
      .join('');
  const desktop = rules(s?.desktop);
  const mobile = rules(s?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}

export function setImageSizeCss(doc: Document, css: string) {
  let style = doc.getElementById('lp-image-size');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'lp-image-size';
    doc.head.appendChild(style);
  }
  style.textContent = css;
  // O tamanho aplicado durante o arrasto sai do estilo em linha: passa a valer o CSS do editor
  doc.querySelectorAll<HTMLElement>('[data-lp-resized]').forEach((el) => {
    ['width', 'max-width', 'height', 'max-height', 'aspect-ratio', 'min-height', 'margin-left', 'margin-right', 'margin-top', 'flex'].forEach((p) => el.style.removeProperty(p));
    delete el.dataset.lpResized;
  });
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

/** Aplica o tamanho (e o corte) direto na moldura e na foto durante o arrasto. */
function applyBoxInline(frame: HTMLElement, img: HTMLElement, b: ImageBox) {
  frame.dataset.lpResized = '1';
  img.dataset.lpResized = '1';
  const set = (el: HTMLElement, p: string, v: string | null) => (v === null ? el.style.removeProperty(p) : el.style.setProperty(p, v, 'important'));
  const hasW = b.w !== undefined;
  set(frame, 'width', hasW ? `${b.w}%` : null);
  set(frame, 'max-width', hasW ? '100%' : null);
  set(frame, 'margin-left', hasW ? 'auto' : null);
  set(frame, 'margin-right', hasW ? 'auto' : null);
  const hasH = b.h !== undefined;
  set(frame, 'height', hasH ? `${b.h}px` : null);
  set(frame, 'aspect-ratio', hasH ? 'auto' : null);
  set(frame, 'min-height', hasH ? '0' : null);
  const bw = b.w ?? 100;
  set(img, 'width', b.iw !== undefined ? `${(b.iw / bw) * 100}%` : null);
  set(img, 'max-width', b.iw !== undefined ? 'none' : null);
  set(img, 'margin-left', b.iw !== undefined ? `-${((b.il ?? 0) / bw) * 100}%` : null);
  set(img, 'flex', b.iw !== undefined ? 'none' : null);
  set(img, 'height', b.ih !== undefined ? `${b.ih}px` : null);
  set(img, 'max-height', b.ih !== undefined ? 'none' : null);
  set(img, 'margin-top', b.ih !== undefined ? `-${b.it ?? 0}px` : null);
}

/** Tira do tamanho o que ficou igual ao padrão (largura 100%, foto do tamanho da moldura). */
function cleanBox(b: ImageBox): ImageBox | null {
  const out: ImageBox = { ...b };
  const bw = out.w ?? 100;
  if (out.iw !== undefined && out.iw <= bw + 0.05) {
    delete out.iw;
    delete out.il;
  } else if (out.il !== undefined && out.il < 0.05) delete out.il;
  if (out.ih !== undefined && (out.h === undefined || out.ih <= out.h)) {
    delete out.ih;
    delete out.it;
  } else if (out.it !== undefined && out.it < 1) delete out.it;
  if (out.w !== undefined && out.w >= 100 && out.iw === undefined) delete out.w;
  return Object.keys(out).length ? out : null;
}
const sameBox = (a: ImageBox | null, b: ImageBox | null) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Modo "Fotos": alças nas quatro bordas e nos quatro cantos das fotos (cantos mudam largura e altura na mesma
 * proporção). Bordas cortam a foto: ela mantém o tamanho e a parte arrastada fica escondida
 * (arrastar para fora mostra de novo o que foi cortado; além disso, a foto cresce para preencher).
 * Duplo clique numa alça volta aquela medida ao padrão do modelo. `onSize(url, null)` = tudo no padrão.
 */
export function attachImageResize(doc: Document, getSize: (url: string) => ImageBox | undefined, onSizes: (changes: Record<string, ImageBox | null>) => void, uiScale = 1) {
  const px = (n: number) => `${Math.round(n * uiScale)}px`;
  const sectionOf = (img: Element) => img.closest<HTMLElement>('[data-section]')?.dataset.section;
  doc.querySelectorAll<HTMLImageElement>('img[data-lp-img]').forEach((img) => {
    const src = img.dataset.lpImg;
    const frame = img.parentElement;
    if (!src || !frame || frame.dataset.lpResize) return;
    // Tamanho próprio desta seção; o tamanho antigo (de todas as seções) é só o ponto de partida
    const url = imageSizeKey(sectionOf(img), src);
    const sizeOf = () => getSize(url) ?? getSize(src);
    // Grava o tamanho desta seção. Se havia o tamanho antigo (de todas as seções), as outras seções
    // onde a foto aparece ficam com ele como tamanho próprio e o antigo deixa de existir
    const onSize = (key: string, box: ImageBox | null) => {
      const changes: Record<string, ImageBox | null> = { [key]: box };
      const legacy = getSize(src);
      if (legacy && key !== src) {
        changes[src] = null;
        doc.querySelectorAll<HTMLImageElement>('img[data-lp-img]').forEach((other) => {
          if (other.dataset.lpImg !== src) return;
          const k = imageSizeKey(sectionOf(other), src);
          if (k !== key && k !== src && !getSize(k)) changes[k] = legacy;
        });
      }
      onSizes(changes);
    };
    frame.dataset.lpResize = '1';
    if (doc.defaultView?.getComputedStyle(frame).position === 'static') frame.style.position = 'relative';

    const label = doc.createElement('div');
    label.dataset.lpUi = 'resize';
    label.setAttribute('style', `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:7;display:none;padding:${px(6)} ${px(10)};border-radius:999px;background:rgba(17,17,17,.8);color:#fff;font:600 ${px(13)}/1 system-ui,sans-serif;pointer-events:none;white-space:nowrap`);
    frame.appendChild(label);

    const make = (edge: Edge) => {
      const h = doc.createElement('div');
      h.dataset.lpUi = 'resize';
      const horizontal = edge === 'left' || edge === 'right';
      const long = px(54);
      const thick = px(12);
      const pos =
        edge === 'left' ? `left:${px(4)};top:50%;margin-top:-${px(27)}` :
        edge === 'right' ? `right:${px(4)};top:50%;margin-top:-${px(27)}` :
        edge === 'top' ? `top:${px(4)};left:50%;margin-left:-${px(27)}` :
        `bottom:${px(4)};left:50%;margin-left:-${px(27)}`;
      h.setAttribute(
        'style',
        `position:absolute;${pos};z-index:6;width:${horizontal ? thick : long};height:${horizontal ? long : thick};border-radius:999px;background:#2563eb;border:${px(2)} solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:${horizontal ? 'ew-resize' : 'ns-resize'};touch-action:none`,
      );
      h.title = horizontal ? 'Arraste para cortar a foto pela lateral (duplo clique: sem corte)' : 'Arraste para cortar a foto em cima/embaixo (duplo clique: sem corte)';

      h.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cur = { ...(sizeOf() ?? {}) };
        if (horizontal) {
          delete cur.w;
          delete cur.iw;
          delete cur.il;
        } else {
          delete cur.h;
          delete cur.ih;
          delete cur.it;
        }
        onSize(url, cleanBox(cur));
      });

      h.addEventListener('pointerdown', (e) => {
        if (currentMode(doc) !== 'fotos' || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const cur = sizeOf() ?? {};
        const rect = frame.getBoundingClientRect();
        // Largura total disponível (100%) a partir da largura atual e do % aplicado
        const available = rect.width / ((cur.w ?? 100) / 100);
        // Medidas de partida: moldura e foto (sem corte, a foto tem o tamanho da moldura)
        const w0 = cur.w ?? 100;
        const iw0 = cur.iw ?? w0;
        const il0 = cur.il ?? 0;
        const h0 = cur.h ?? Math.round(rect.height);
        const ih0 = cur.ih ?? h0;
        const it0 = cur.it ?? 0;
        const sx = e.clientX;
        const sy = e.clientY;
        let next: ImageBox | null = { ...cur };
        h.setPointerCapture(e.pointerId);
        label.style.display = 'block';
        const show = () => {
          label.textContent = horizontal ? `Largura ${Math.round(next?.w ?? 100)}%` : `Altura ${Math.round(next?.h ?? rect.height)}px`;
        };
        show();
        const move = (ev: PointerEvent) => {
          if (horizontal) {
            // A largura muda o mesmo tanto que o ponteiro andou: essa faixa da foto fica escondida.
            // O lado oposto continua igual; arrastar para fora mostra o que foi cortado
            const dx = ((ev.clientX - sx) / available) * 100 * (edge === 'right' ? 1 : -1);
            const w = Math.min(100, Math.max(IMG_W_MIN, w0 + dx));
            let iw = iw0;
            let il = il0;
            if (edge === 'right') iw = Math.max(iw0, il0 + w);
            else {
              il = il0 - (w - w0);
              // Passou do que foi cortado: a foto cresce para continuar preenchendo
              if (il < 0) {
                iw = iw0 - il;
                il = 0;
              }
            }
            const r = (n: number) => Math.round(n * 10) / 10;
            // A altura fica fixa (senão a proporção do modelo encolheria a foto junto)
            next = { ...cur, w: r(w), h: h0, iw: r(iw), il: r(il), ...(cur.ih !== undefined ? {} : { ih: h0 }) };
          } else {
            const dy = (ev.clientY - sy) * (edge === 'bottom' ? 1 : -1);
            const hh = Math.round(Math.min(IMG_H_MAX, Math.max(IMG_H_MIN, h0 + dy)));
            let ih = ih0;
            let it = it0;
            if (edge === 'bottom') ih = Math.max(ih0, it0 + hh);
            else {
              it = it0 - (hh - h0);
              if (it < 0) {
                ih = ih0 - it;
                it = 0;
              }
            }
            next = { ...cur, h: hh, ih: Math.round(ih), it: Math.round(it) };
          }
          applyBoxInline(frame, img, next);
          show();
        };
        const up = () => {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          label.style.display = 'none';
          let done = cleanBox(next ?? {});
          // Lateral de volta a 100% sem corte: a altura fixada só para o corte também sai
          if (horizontal && done && done.w === undefined && done.iw === undefined && cur.h === undefined) {
            delete done.h;
            done = cleanBox(done);
          }
          if (!sameBox(done, cleanBox(cur))) onSize(url, done);
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      });
      return h;
    };
    // Cantos: largura e altura juntas, mantendo a proporção atual da foto
    const makeCorner = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
      const h = doc.createElement('div');
      h.dataset.lpUi = 'resize';
      const vertical = corner[0] === 't' ? 'top' : 'bottom';
      const horizontal = corner[1] === 'l' ? 'left' : 'right';
      h.setAttribute(
        'style',
        `position:absolute;${vertical}:${px(4)};${horizontal}:${px(4)};z-index:6;width:${px(18)};height:${px(18)};border-radius:50%;background:#2563eb;border:${px(2)} solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:${corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize'};touch-action:none`,
      );
      h.title = 'Arraste o canto para aumentar ou diminuir a foto na mesma proporção (duplo clique: tamanho padrão)';
      h.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSize(url, null);
      });
      h.addEventListener('pointerdown', (e) => {
        if (currentMode(doc) !== 'fotos' || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const cur = sizeOf() ?? {};
        const rect = frame.getBoundingClientRect();
        const available = rect.width / ((cur.w ?? 100) / 100);
        const ratio = rect.height / rect.width || 1;
        const sx = e.clientX;
        const sy = e.clientY;
        let next: ImageBox = { ...cur };
        h.setPointerCapture(e.pointerId);
        label.style.display = 'block';
        const show = () => (label.textContent = `Largura ${Math.round(next.w ?? 100)}% · Altura ${next.h ?? Math.round(rect.height)}px`);
        show();
        const move = (ev: PointerEvent) => {
          frame.dataset.lpResized = '1';
          // Foto centralizada: a largura muda o dobro do deslocamento lateral; a altura acompanha a proporção.
          // Vale o movimento maior (de lado ou para cima/baixo), convertido em largura
          const byX = (ev.clientX - sx) * (horizontal === 'right' ? 2 : -2);
          const byY = ((ev.clientY - sy) * (vertical === 'bottom' ? 1 : -1)) / ratio;
          const dw = Math.abs(byX) >= Math.abs(byY) ? byX : byY;
          const minW = Math.max((available * IMG_W_MIN) / 100, IMG_H_MIN / ratio);
          const maxW = Math.min(available, IMG_H_MAX / ratio);
          const widthPx = Math.min(maxW, Math.max(minW, rect.width + dw));
          next = { w: Math.round((widthPx / available) * 1000) / 10, h: Math.round(widthPx * ratio) };
          // Foto cortada: o corte cresce/encolhe junto, na mesma proporção
          const k = widthPx / rect.width;
          if (cur.iw !== undefined) next = { ...next, iw: Math.round(cur.iw * k * 10) / 10, il: Math.round((cur.il ?? 0) * k * 10) / 10 };
          if (cur.ih !== undefined) next = { ...next, ih: Math.round(cur.ih * k), it: Math.round((cur.it ?? 0) * k) };
          applyBoxInline(frame, img, next);
          show();
        };
        const up = () => {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          label.style.display = 'none';
          const done = cleanBox(next);
          if (!sameBox(done, cleanBox(cur))) onSize(url, done);
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      });
      return h;
    };
    frame.append(make('left'), make('right'), make('top'), make('bottom'), makeCorner('tl'), makeCorner('tr'), makeCorner('bl'), makeCorner('br'));
  });
}

/**
 * Modo "Espaços": cada seção ganha uma alça na borda de baixo. Arrastar para cima diminui
 * (para baixo aumenta) a margem interna de cima e de baixo daquela seção; duplo clique volta ao padrão.
 * `onChange(key, pct)` com pct = null remove o valor próprio da seção.
 */
export function attachSpacingDrag(doc: Document, onChange: (key: string, pct: number | null) => void, uiScale = 1) {
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpSpacing) return;
  doc.body.dataset.lpSpacing = '1';
  const px = (n: number) => `${Math.round(n * uiScale)}px`;
  const scaleOf = (w: HTMLElement) => parseFloat(win.getComputedStyle(w).getPropertyValue('--section-y-scale')) || SPACING_BASE;
  const pctOf = (w: HTMLElement) => Math.round((scaleOf(w) / SPACING_BASE) * 100);

  doc.querySelectorAll<HTMLElement>('[data-section]').forEach((w) => {
    const key = w.dataset.section;
    const inner = w.firstElementChild as HTMLElement | null;
    if (!key || !inner) return;
    if (win.getComputedStyle(w).position === 'static') w.style.position = 'relative';

    const handle = doc.createElement('div');
    handle.dataset.lpUi = 'spacing';
    handle.title = 'Arraste para cima para diminuir o espaço interno desta seção (para baixo aumenta). Duplo clique: padrão.';
    handle.setAttribute(
      'style',
      `position:absolute;left:50%;bottom:0;transform:translate(-50%,50%);z-index:46;display:flex;align-items:center;gap:${px(6)};padding:${px(6)} ${px(12)};border-radius:999px;background:#2563eb;color:#fff;font:600 ${px(12)}/1 system-ui,sans-serif;box-shadow:0 6px 18px rgba(37,99,235,.35);cursor:ns-resize;touch-action:none;user-select:none;white-space:nowrap`,
    );
    const label = () => (handle.textContent = `↕ Espaço ${pctOf(w)}%`);
    label();
    w.appendChild(handle);

    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      w.style.removeProperty('--section-y-scale');
      onChange(key, null);
      setTimeout(label, 50);
    });

    handle.addEventListener('pointerdown', (e) => {
      if (currentMode(doc) !== 'espacos' || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startScale = scaleOf(w);
      const startPad = parseFloat(win.getComputedStyle(inner).paddingBottom) || 0;
      // Padding que esta seção teria com escala 1 (a borda de baixo acompanha o ponteiro)
      const unit = startScale > 0 ? startPad / startScale : 0;
      const sy = e.clientY;
      let pct = pctOf(w);
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        if (!unit) return;
        const pad = Math.max(0, startPad + (ev.clientY - sy));
        pct = Math.round(Math.min(150, Math.max(0, (pad / unit / SPACING_BASE) * 100)));
        w.style.setProperty('--section-y-scale', String(spacingScale(pct)));
        handle.textContent = `↕ Espaço ${pct}%`;
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        onChange(key, pct);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  });
}

/** Atualiza o rótulo das alças depois que o CSS de espaços muda (ex.: controle geral na aba Visual). */
function refreshSpacingLabels(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  doc.querySelectorAll<HTMLElement>('[data-lp-ui="spacing"]').forEach((h) => {
    const w = h.parentElement;
    if (!w) return;
    const s = parseFloat(win.getComputedStyle(w).getPropertyValue('--section-y-scale')) || SPACING_BASE;
    h.textContent = `↕ Espaço ${Math.round((s / SPACING_BASE) * 100)}%`;
  });
}

/** Estilo dos controles do editor dentro da prévia (não existe na página publicada). */
const EDITOR_CSS = `
html:not(.lp-mode-fotos) [data-lp-ui="zoom"],html:not(.lp-mode-fotos) [data-lp-ui="resize"]{display:none!important}
[data-lp-ui="resize"]{opacity:.85;transition:opacity .15s,transform .15s}
[data-lp-ui="resize"]:hover{opacity:1}
html:not(.lp-mode-textos) [data-lp-ui="quote-edit"],html.lp-mode-textos .quote-more{display:none!important}
html:not(.lp-mode-secoes) [data-lp-ui="section"]{display:none!important}
html:not(.lp-mode-espacos) [data-lp-ui="spacing"]{display:none!important}
html.lp-mode-espacos [data-section]{outline:1px dashed rgba(37,99,235,.5);outline-offset:-1px}
html.lp-mode-secoes main>[data-section]:not([data-section="hero"]):not([data-section="contact"]):not([data-section="final_cta"]){outline:2px dashed rgba(37,99,235,.45);outline-offset:-3px}
html:not(.lp-mode-fotos) [data-lp-drag-handle]{cursor:auto!important;touch-action:auto!important}
html.lp-mode-fotos .gallery figure:hover img:not([style*=scale]){transform:none}
html.lp-mode-cores body *{cursor:crosshair!important}
html.lp-mode-mover body *{cursor:move!important}
html.lp-mode-mover :is(img,figure,h1,h2,h3,h4,p,li,blockquote,.btn,.eyebrow,.card){touch-action:none;user-select:none;-webkit-user-select:none}
html.lp-mode-mover img{-webkit-user-drag:none}
html.lp-mode-mover [data-lp-moving]{outline:2px solid #2563eb!important;outline-offset:2px}
html.lp-mode-textos [data-lp-text]{outline:1px dashed rgba(37,99,235,.55);outline-offset:3px;cursor:text!important;border-radius:2px}
html.lp-mode-textos [data-lp-text]:hover{outline:2px solid #2563eb}
html.lp-mode-textos [data-lp-text][contenteditable]:not([contenteditable="false"]){outline:2px solid #2563eb;background:rgba(37,99,235,.07);caret-color:#2563eb}
html.lp-mode-textos [data-lp-icon]{outline:1px dashed rgba(37,99,235,.55);outline-offset:4px;cursor:pointer!important;border-radius:4px}
html.lp-mode-textos [data-lp-selected]{outline:2px solid #f59e0b!important;outline-offset:3px}
html.lp-mode-textos [data-lp-icon]:hover,html.lp-mode-textos .icon-box:hover [data-lp-icon]{outline:2px solid #2563eb}
html.lp-mode-textos .icon-box:has([data-lp-icon]){cursor:pointer!important}
html.lp-mode-textos [data-lp-empty]:empty{min-width:4em;min-height:1em;display:inline-block}
html.lp-mode-textos [data-lp-empty]:empty::before{content:attr(data-lp-placeholder);opacity:.5;font-style:italic;font-weight:400;letter-spacing:normal;text-transform:none}
`;

export function setupEditorDocument(doc: Document) {
  if (doc.getElementById('lp-editor-css')) return;
  const style = doc.createElement('style');
  style.id = 'lp-editor-css';
  style.textContent = EDITOR_CSS;
  doc.head.appendChild(style);
}

export function setPreviewMode(doc: Document, mode: PreviewMode) {
  const root = doc.documentElement;
  root.classList.remove('lp-mode-textos', 'lp-mode-fotos', 'lp-mode-mover', 'lp-mode-secoes', 'lp-mode-espacos', 'lp-mode-cores');
  root.classList.add(`lp-mode-${mode}`);
  // Respostas do FAQ ficam abertas para poderem ser editadas
  if (mode === 'textos') doc.querySelectorAll<HTMLDetailsElement>('.faq details').forEach((d) => (d.open = true));
}

export const currentMode = (doc: Document): PreviewMode =>
  (['textos', 'mover', 'secoes', 'espacos', 'cores'] as const).find((m) => doc.documentElement.classList.contains(`lp-mode-${m}`)) ?? 'fotos';

// ─── Arrastar seções ────────────────────────────────────────────────
/** Topo, contato e CTA final têm posição fixa na página. */
const FIXED_START = ['hero'];
const FIXED_END = ['contact', 'final_cta'];

export function attachSectionDrag(doc: Document, onReorder: (keys: string[]) => void, uiScale = 1, initialOrder: string[] = []) {
  const main = doc.querySelector('main');
  const win = doc.defaultView;
  if (!main || !win || main.dataset.lpSections) return;
  main.dataset.lpSections = '1';
  const px = (n: number) => `${Math.round(n * uiScale)}px`;
  const key = (w: HTMLElement) => w.dataset.section ?? '';
  const wrappers = () => Array.from(main.children).filter((c): c is HTMLElement => c instanceof win.HTMLElement && !!c.dataset.section);

  // A ordem passa a ser controlada por "order" (vale tanto para a ordem do celular quanto do computador)
  main.style.display = 'flex';
  main.style.flexDirection = 'column';
  const visual = () => wrappers().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const movable = () => visual().filter((w) => !FIXED_START.includes(key(w)) && !FIXED_END.includes(key(w)));

  const commit = (mid: HTMLElement[], notify = true) => {
    const all = wrappers();
    const start = all.filter((w) => FIXED_START.includes(key(w)));
    const end = FIXED_END.map((k) => all.find((w) => key(w) === k)).filter((w): w is HTMLElement => !!w);
    [...start, ...mid, ...end].forEach((w, i) => (w.style.order = String(i)));
    if (notify) onReorder(mid.map(key));
  };
  // Reaplica a ordem ainda não salva (a prévia mostra a última versão salva)
  const rank = new Map(initialOrder.map((k, i) => [k, i]));
  commit(
    movable()
      .map((w, i) => ({ w, r: rank.get(key(w)) ?? initialOrder.length + i }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.w),
    false,
  );

  const move = (w: HTMLElement, dir: -1 | 1) => {
    const mid = movable();
    const i = mid.indexOf(w);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= mid.length) return;
    [mid[i], mid[j]] = [mid[j], mid[i]];
    commit(mid);
    w.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const indicator = doc.createElement('div');
  indicator.dataset.lpUi = 'section';
  indicator.setAttribute('style', `position:fixed;left:0;right:0;height:${px(4)};background:#2563eb;box-shadow:0 0 0 ${px(3)} rgba(37,99,235,.25);z-index:9999;pointer-events:none;display:none`);
  doc.body.appendChild(indicator);

  const btnStyle = `height:${px(32)};min-width:${px(32)};padding:0 ${px(10)};border:0;border-radius:${px(8)};background:transparent;color:#fff;font:600 ${px(13)}/1 system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:${px(6)}`;

  for (const w of wrappers()) {
    const k = key(w);
    if (FIXED_START.includes(k) || FIXED_END.includes(k)) continue;
    if (win.getComputedStyle(w).position === 'static') w.style.position = 'relative';

    const bar = doc.createElement('div');
    bar.dataset.lpUi = 'section';
    bar.setAttribute('style', `position:absolute;left:${px(12)};top:${px(12)};z-index:45;display:flex;gap:${px(2)};padding:${px(4)};border-radius:${px(12)};background:rgba(17,24,39,.88);box-shadow:0 8px 24px rgba(0,0,0,.3)`);
    const mk = (label: string, title: string) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.setAttribute('style', btnStyle);
      b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255,255,255,.16)'));
      b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
      return b;
    };
    const grip = mk('⠿ Arrastar', 'Arraste para mudar a posição da seção');
    grip.style.cursor = 'grab';
    grip.style.touchAction = 'none';
    const up = mk('↑', 'Subir seção');
    const down = mk('↓', 'Descer seção');
    up.addEventListener('click', (e) => { e.preventDefault(); move(w, -1); });
    down.addEventListener('click', (e) => { e.preventDefault(); move(w, 1); });
    bar.append(grip, up, down);
    w.appendChild(bar);

    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.style.cursor = 'grabbing';
      w.style.opacity = '.45';
      const others = movable().filter((o) => o !== w);
      let lastY = e.clientY;
      let target = 0;

      const place = () => {
        target = others.filter((o) => {
          const r = o.getBoundingClientRect();
          return r.top + r.height / 2 < lastY;
        }).length;
        const ref = others[target] ?? others[others.length - 1];
        if (!ref) return;
        const r = ref.getBoundingClientRect();
        indicator.style.top = `${(target < others.length ? r.top : r.bottom) - 2}px`;
        indicator.style.display = 'block';
      };
      // Rolagem automática perto das bordas (seções costumam ser mais altas que a tela)
      const timer = win.setInterval(() => {
        const edge = 90 * uiScale;
        const h = win.innerHeight;
        // "instant": a página usa scroll-behavior:smooth, que travaria a rolagem a cada passo
        if (lastY < edge) win.scrollBy({ top: -Math.ceil((edge - lastY) / 3), behavior: 'instant' });
        else if (lastY > h - edge) win.scrollBy({ top: Math.ceil((lastY - (h - edge)) / 3), behavior: 'instant' });
        place();
      }, 16);

      const onMove = (ev: PointerEvent) => {
        lastY = ev.clientY;
        place();
      };
      const end = () => {
        win.clearInterval(timer);
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        grip.style.cursor = 'grab';
        w.style.opacity = '';
        indicator.style.display = 'none';
        const current = movable();
        const next = [...others];
        next.splice(target, 0, w);
        if (next.some((n, i) => n !== current[i])) commit(next);
      };
      place();
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
  }
}

// ─── Escolher cores clicando ───────────────────────────────────────
export interface PickedElement {
  /** Seletor só deste elemento */
  exact: string;
  /** Seletor de todos os elementos iguais (mesma estrutura) */
  similar: string;
  label: string;
  text: string;
  bg: string;
  bgTransparent: boolean;
  /** Tamanho da fonte atual, em px */
  size: number;
  /** Posição do clique no documento da prévia (px da prévia) */
  x: number;
  y: number;
  el: HTMLElement;
}

/** Classes que mudam conforme estado/posição e não devem entrar no seletor. */
// Classes que mudam na prévia (animações): fora do seletor, senão ele não bateria com a página publicada
const VOLATILE = new Set(['reveal', 'in', 'section-alt', 'fx-in', 'fx-demo', 'fx-typing']);

/**
 * Elementos que existem só na prévia do editor (barras de controle e campos opcionais vazios):
 * não entram na contagem do :nth-child, senão o seletor não bateria com a página publicada.
 */
function editorOnly(c: Element) {
  if (c.hasAttribute('data-lp-ui') || c.classList.contains('lp-social-hint')) return true;
  const empty = (e: Element | null) => !!e && e.hasAttribute('data-lp-empty') && !e.textContent?.trim();
  return empty(c) || (c.hasAttribute('data-lp-hide-empty') && empty(c.querySelector('[data-lp-empty]')));
}

function segment(el: Element, withIndex: boolean) {
  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList)
    .filter((c) => !VOLATILE.has(c) && /^[A-Za-z0-9_-]{1,60}$/.test(c))
    .slice(0, 6);
  let s = tag + classes.map((c) => `.${c}`).join('');
  const parent = el.parentElement;
  const siblings = parent ? Array.from(parent.children).filter((c) => c === el || !editorOnly(c)) : [];
  if (withIndex && siblings.length > 1) s += `:nth-child(${siblings.indexOf(el) + 1})`;
  return s;
}

export function selectorFor(el: HTMLElement, withIndex: boolean) {
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur.tagName !== 'BODY') {
    if (cur.dataset.section && /^[a-z0-9:_-]{1,60}$/.test(cur.dataset.section)) {
      parts.unshift(`[data-section="${cur.dataset.section}"]`);
      return parts.join('>');
    }
    parts.unshift(segment(cur, withIndex));
    cur = cur.parentElement;
  }
  parts.unshift('body');
  return parts.join('>');
}

/** Converte a cor calculada pelo navegador (rgb/rgba/color(srgb …)) em #rrggbb; alfa 0 = null. */
export function cssColorToHex(value: string): string | null {
  let nums: number[] | null = null;
  const rgb = /rgba?\(([^)]+)\)/.exec(value);
  if (rgb) {
    nums = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  } else {
    const srgb = /color\(srgb ([^)]+)\)/.exec(value);
    if (srgb) {
      const v = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
      nums = [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1];
    }
  }
  if (!nums || nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null;
  if (nums.length > 3 && nums[3] === 0) return null;
  return `#${nums.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`;
}

const NAMES: Record<string, string> = {
  h1: 'Título principal',
  h2: 'Título',
  h3: 'Título',
  p: 'Texto',
  li: 'Item',
  a: 'Link',
  button: 'Botão',
  section: 'Seção (fundo)',
  header: 'Cabeçalho',
  footer: 'Rodapé',
  nav: 'Menu',
  small: 'Texto pequeno',
  strong: 'Texto em destaque',
  span: 'Texto',
  blockquote: 'Depoimento',
  figure: 'Foto',
  summary: 'Pergunta',
  details: 'Pergunta',
  article: 'Cartão',
  aside: 'Cartão',
  dt: 'Rótulo',
  dd: 'Valor',
};

function describe(el: HTMLElement) {
  if (el.classList.contains('btn')) return 'Botão';
  if (el.classList.contains('eyebrow')) return 'Linha de apoio';
  if (el.classList.contains('card') || el.classList.contains('quote')) return 'Cartão';
  if (el.classList.contains('ico')) return 'Ícone';
  if (el.classList.contains('container')) return 'Área da seção';
  return NAMES[el.tagName.toLowerCase()] ?? 'Elemento';
}

export function attachColorPick(doc: Document, onPick: (p: PickedElement) => void) {
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpColors) return;
  doc.body.dataset.lpColors = '1';

  const hover = doc.createElement('div');
  hover.dataset.lpUi = 'color';
  hover.setAttribute('style', 'position:fixed;z-index:9998;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,.08);border-radius:3px;display:none');
  doc.body.appendChild(hover);

  const resolve = (target: EventTarget | null): HTMLElement | null => {
    let el = target instanceof win.Element ? (target as Element) : null;
    // Ícones em SVG: usa o elemento HTML que os contém (a cor deles vem do texto)
    while (el && !(el instanceof win.HTMLElement)) el = el.parentElement;
    if (!el || el.closest('[data-lp-ui]') || el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'MAIN') return null;
    return el as HTMLElement;
  };

  doc.addEventListener('mousemove', (e) => {
    const el = currentMode(doc) === 'cores' ? resolve(e.target) : null;
    if (!el) {
      hover.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(hover.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  });
  doc.addEventListener('mouseleave', () => (hover.style.display = 'none'));

  doc.addEventListener(
    'click',
    (e) => {
      if (currentMode(doc) !== 'cores') return;
      const el = resolve(e.target);
      if (!el) return;
      // Nada de navegar, abrir menus ou perguntas enquanto escolhe cores
      e.preventDefault();
      e.stopPropagation();
      const cs = win.getComputedStyle(el);
      let bg = cssColorToHex(cs.backgroundColor);
      const bgTransparent = !bg;
      // Fundo transparente: mostra o fundo que aparece por trás
      for (let p = el.parentElement; !bg && p; p = p.parentElement) bg = cssColorToHex(win.getComputedStyle(p).backgroundColor);
      onPick({
        exact: selectorFor(el, true),
        similar: selectorFor(el, false),
        label: describe(el),
        text: cssColorToHex(cs.color) ?? '#000000',
        bg: bg ?? '#ffffff',
        bgTransparent,
        size: Math.round(parseFloat(cs.fontSize)) || 16,
        x: e.clientX,
        y: e.clientY,
        el,
      });
    },
    true,
  );
}

// ─── Mover fotos e textos ──────────────────────────────────────────
/** Offset salvo de um seletor no layout atual. */
export type MoveOffset = { mx: number; my: number };

/** Elemento que se move ao arrastar: a moldura da foto (não só a imagem dentro dela) ou o botão inteiro. */
function movableFor(win: Window & typeof globalThis, target: EventTarget | null): HTMLElement | null {
  let el = target instanceof win.Element ? (target as Element) : null;
  while (el && !(el instanceof win.HTMLElement)) el = el.parentElement;
  if (!el || el.closest('[data-lp-ui]') || ['BODY', 'HTML', 'MAIN'].includes(el.tagName)) return null;
  if (el.dataset.section !== undefined || el.tagName === 'SECTION' || el.classList.contains('container')) return null;
  if (el.tagName === 'IMG') return (el.closest('figure,.hero-media,.about-media') as HTMLElement | null) ?? el;
  return (el.closest('.btn') as HTMLElement | null) ?? el;
}

/**
 * Modo "Mover": arrastar qualquer foto ou texto para outro ponto da seção (mouse ou dedo).
 * O elemento não sai da área da seção (assim a página nunca ganha rolagem lateral).
 * Duplo clique volta à posição original. `onMove(seletor, null)` = sem deslocamento.
 */
export function attachMoveDrag(doc: Document, getOffset: (sel: string) => MoveOffset | undefined, onMove: (sel: string, off: MoveOffset | null) => void) {
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpMove) return;
  doc.body.dataset.lpMove = '1';
  let moved = false;

  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (currentMode(doc) !== 'mover' || e.button > 0) return;
      const el = movableFor(win, e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = selectorFor(el, true);
      const start = getOffset(sel) ?? { mx: 0, my: 0 };
      // Limites: o retângulo do elemento sem deslocamento tem de caber na seção
      const r = el.getBoundingClientRect();
      const base = { left: r.left - start.mx, top: r.top - start.my, right: r.right - start.mx, bottom: r.bottom - start.my };
      const area = ((el.closest('[data-section]') as HTMLElement | null) ?? doc.body).getBoundingClientRect();
      const vw = doc.documentElement.clientWidth;
      const minX = Math.max(area.left, 0) - base.left;
      const maxX = Math.min(area.right, vw) - base.right;
      const minY = area.top - base.top;
      const maxY = area.bottom - base.bottom;
      const clamp = (v: number, lo: number, hi: number) => Math.round(lo > hi ? 0 : Math.min(hi, Math.max(lo, v)));
      const x0 = e.clientX;
      const y0 = e.clientY;
      let cur = start;
      moved = false;
      el.setAttribute('data-lp-moving', '');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* sem captura: o arrasto segue pelo documento */
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        cur = { mx: clamp(start.mx + dx, minX, maxX), my: clamp(start.my + dy, minY, maxY) };
        el.style.setProperty('translate', `${cur.mx}px ${cur.my}px`, 'important');
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        doc.removeEventListener('pointercancel', up);
        el.removeAttribute('data-lp-moving');
        if (moved) onMove(sel, cur.mx || cur.my ? cur : null);
        // O CSS salvo passa a valer (o estilo em linha era só durante o arrasto)
        win.requestAnimationFrame(() => el.style.removeProperty('translate'));
      };
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
      doc.addEventListener('pointercancel', up);
    },
    true,
  );
  // Sem abrir links, perguntas ou menus ao soltar
  doc.addEventListener(
    'click',
    (e) => {
      if (currentMode(doc) !== 'mover') return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  doc.addEventListener(
    'dblclick',
    (e) => {
      if (currentMode(doc) !== 'mover') return;
      const el = movableFor(win, e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const sel = selectorFor(el, true);
      if (getOffset(sel)) onMove(sel, null);
    },
    true,
  );
  doc.addEventListener('dragstart', (e) => currentMode(doc) === 'mover' && e.preventDefault(), true);
}

/**
 * Na prévia existem elementos que a página publicada não tem (barras do editor e campos opcionais
 * vazios). Os seletores gravados contam posições como na página publicada; aqui o :nth-child passa a
 * ignorar esses elementos para acertar o mesmo alvo.
 */
const EDITOR_ONLY_SEL = '[data-lp-ui],[data-lp-empty]:empty,[data-lp-hide-empty]:has([data-lp-empty]:empty)';
function forPreview(css: string) {
  return css.replace(/:nth-child\((\d+)\)/g, `:nth-child($1 of :not(${EDITOR_ONLY_SEL}))`);
}

/** Rascunho ao vivo enquanto o popup está aberto (some ao salvar ou cancelar). */
export function setDraftCss(doc: Document, css: string) {
  let style = doc.getElementById('lp-editor-draft');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'lp-editor-draft';
    doc.head.appendChild(style);
  }
  style.textContent = forPreview(css);
}

export function setSpacingCss(doc: Document, css: string) {
  let style = doc.getElementById('lp-spacing');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'lp-spacing';
    doc.head.appendChild(style);
  }
  style.textContent = forPreview(css);
  // O valor aplicado durante o arrasto sai do estilo em linha: passa a valer o CSS salvo no editor
  doc.querySelectorAll<HTMLElement>('[data-section]').forEach((w) => w.style.removeProperty('--section-y-scale'));
  refreshSpacingLabels(doc);
}

export function setColorsCss(doc: Document, css: string) {
  let style = doc.getElementById('lp-colors');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'lp-colors';
    doc.head.appendChild(style);
  }
  style.textContent = forPreview(css);
}

// ─── Editar textos direto na página ────────────────────────────────
/**
 * Textos marcados com data-lp-text (só na prévia) viram editáveis ao clicar.
 * Enter ou clicar fora confirma; Esc desfaz. `onText` devolve false quando o valor é recusado.
 */
export interface TextSizeOptions {
  /** Estilo salvo para o seletor no layout atual */
  getStyle: (selector: string) => ElementColor | undefined;
  /** Altera o estilo do seletor no layout atual; `null` remove a propriedade */
  setStyle: (selector: string, patch: { [K in keyof ElementColor]?: ElementColor[K] | null }) => void;
  /** Layout mostrado na prévia (texto da barra) */
  deviceLabel: string;
  /** Efeito de movimento do seletor: vale para celular e computador; `null` remove */
  setEffect?: (selector: string, fx: TextEffect | null) => void;
  /** Velocidade do efeito (0,1 a 2; `null` = normal): vale para celular e computador */
  setFxSpeed?: (selector: string, speed: number | null) => void;
  /** Excluir (true) ou restaurar (null) o elemento: vale para celular e computador */
  setHidden?: (selector: string, hidden: true | null) => void;
  uiScale?: number;
}

const TEXT_STYLE_KEYS = ['text', 'bg', 'size', 'font', 'bold', 'italic', 'underline', 'hidden'] as const;

/** Barra flutuante sobre o texto em edição: fonte, tamanho, negrito, itálico, sublinhado e cor (só na prévia). */
function textToolbar(doc: Document, el: HTMLElement, opts: TextSizeOptions, extra: { onParent?: () => void; onRemoved?: () => void; onIcon?: () => void } = {}) {
  const win = doc.defaultView!;
  const px = (n: number) => `${Math.round(n * (opts.uiScale ?? 1))}px`;
  const exact = selectorFor(el, true);
  const similar = selectorFor(el, false);
  const hasStyle = (sel: string) => TEXT_STYLE_KEYS.some((k) => opts.getStyle(sel)?.[k] !== undefined);
  let scope: 'exact' | 'similar' = hasStyle(similar) && !hasStyle(exact) ? 'similar' : 'exact';
  const sel = () => (scope === 'exact' ? exact : similar);
  const saved = () => opts.getStyle(sel()) ?? {};
  const cs = () => win.getComputedStyle(el);
  const computedSize = () => Math.round(parseFloat(cs().fontSize)) || 16;

  const bar = doc.createElement('div');
  bar.dataset.lpUi = 'size';
  bar.setAttribute('style', `position:fixed;z-index:9999;display:flex;flex-direction:column;gap:${px(2)};padding:${px(4)};border-radius:${px(10)};background:rgba(17,24,39,.94);color:#fff;font:500 ${px(12)}/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap;box-sizing:border-box;max-width:calc(100vw - ${px(8)})`);
  // Linhas quebram quando a prévia é estreita (celular): a barra nunca passa da largura da tela
  const row = () => {
    const r = doc.createElement('div');
    r.setAttribute('style', `display:flex;flex-wrap:wrap;align-items:center;gap:${px(2)}`);
    return r;
  };
  const btnCss = `height:${px(28)};min-width:${px(28)};padding:0 ${px(8)};border:0;border-radius:${px(7)};background:transparent;color:#fff;font:600 ${px(13)}/1 system-ui,sans-serif;cursor:pointer`;
  const mk = (label: string, title: string, onClick: () => void, extra = '') => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('style', btnCss + extra);
    // mousedown sem padrão: o texto continua em edição (sem perder o foco)
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  const fieldCss = `height:${px(28)};border:0;border-radius:${px(7)};background:rgba(255,255,255,.12);color:#fff;font:500 ${px(12)}/1 system-ui,sans-serif;cursor:pointer`;

  // Fonte
  const font = doc.createElement('select');
  font.title = 'Fonte';
  font.setAttribute('style', `${fieldCss};max-width:${px(150)};padding:0 ${px(6)}`);
  font.append(new Option('Fonte padrão', ''));
  for (const [key, f] of Object.entries(TEXT_FONTS)) {
    const o = new Option(f.label, key);
    o.style.fontFamily = f.stack;
    o.style.color = '#111';
    font.append(o);
  }
  font.addEventListener('change', () => {
    loadTextFont(doc, font.value || undefined);
    opts.setStyle(sel(), { font: font.value || null });
    later(render);
  });

  // Tamanho
  const value = doc.createElement('span');
  value.setAttribute('style', `min-width:${px(42)};text-align:center;font-variant-numeric:tabular-nums`);
  const size = () => saved().size ?? computedSize();
  const setSize = (next: number) => {
    opts.setStyle(sel(), { size: next });
    render();
  };
  const step = () => (size() < 24 ? 1 : 2);

  // Negrito, itálico e sublinhado: o botão inverte o que está aparecendo agora
  const isBold = () => saved().bold ?? Number(cs().fontWeight) >= 600;
  const isItalic = () => saved().italic ?? cs().fontStyle === 'italic';
  const isUnderline = () => saved().underline ?? cs().textDecorationLine.includes('underline');
  const bold = mk('B', 'Negrito', () => (opts.setStyle(sel(), { bold: !isBold() }), render()), ';font-weight:800');
  const italic = mk('I', 'Itálico', () => (opts.setStyle(sel(), { italic: !isItalic() }), render()), ';font-style:italic;font-family:Georgia,serif');
  const underline = mk('U', 'Sublinhado', () => (opts.setStyle(sel(), { underline: !isUnderline() }), render()), ';text-decoration:underline');

  // Cor do texto
  const color = doc.createElement('input');
  color.type = 'color';
  color.title = 'Cor do texto';
  color.setAttribute('style', `${fieldCss};width:${px(34)};padding:${px(3)}`);
  color.addEventListener('input', () => opts.setStyle(sel(), { text: color.value }));

  // Cor de fundo
  const bg = doc.createElement('input');
  bg.type = 'color';
  bg.title = 'Cor de fundo';
  bg.setAttribute('style', `${fieldCss};width:${px(34)};padding:${px(3)}`);
  bg.addEventListener('input', () => opts.setStyle(sel(), { bg: bg.value }));
  const bgLabel = doc.createElement('span');
  bgLabel.textContent = 'Fundo';
  bgLabel.setAttribute('style', `opacity:.7;padding-left:${px(4)}`);

  // Excluir / restaurar o elemento (na página publicada ele some; na prévia fica apagado)
  const remove = mk('', 'Excluir este elemento da página (celular e computador)', () => {
    const hidden = !saved().hidden;
    if (hidden && !window.confirm('Tem certeza de que deseja apagar este elemento da página? (dá para restaurar depois)')) return;
    opts.setHidden?.(sel(), hidden ? true : null);
    later(render);
    if (hidden) extra.onRemoved?.();
  });
  // Elemento de fora (ex.: do texto para o cartão inteiro)
  const iconBtn = extra.onIcon ? mk('◇ Trocar ícone', 'Escolher outro ícone', extra.onIcon, `;font-weight:500;font-size:${px(12)};background:rgba(255,255,255,.12)`) : null;
  const parent = extra.onParent ? mk('↑ Elemento de fora', 'Selecionar o elemento que contém este', extra.onParent, `;font-weight:500;font-size:${px(12)}`) : null;

  const scopeBtn = mk('', 'Aplicar só neste texto ou em todos os textos iguais a este', () => {
    scope = scope === 'exact' ? 'similar' : 'exact';
    render();
  });
  const reset = mk('⟲', 'Voltar ao padrão (fonte, tamanho, estilo e cor do texto)', () => {
    opts.setStyle(sel(), { text: null, bg: null, size: null, font: null, bold: null, italic: null, underline: null, w: null, wc: null });
    later(render);
  });
  // Efeito de movimento quando o texto aparece na tela: menu desenhado dentro da barra (uma lista nativa
  // abriria fora da escala da prévia, com a fonte desproporcional)
  const effect = mk('', 'Efeito quando o texto aparece na tela (celular e computador)', () => {
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    place();
  }, `;background:rgba(255,255,255,.12);font-weight:500;font-size:${px(12)}`);
  const menu = doc.createElement('div');
  menu.setAttribute('style', `display:none;flex-direction:column;gap:${px(6)};padding:${px(6)} ${px(4)} ${px(2)};max-width:min(${px(330)}, 100%);box-sizing:border-box;white-space:normal`);
  const chipCss = `height:${px(26)};padding:0 ${px(9)};border:0;border-radius:${px(13)};background:rgba(255,255,255,.1);color:#fff;font:500 ${px(12)}/1 system-ui,sans-serif;cursor:pointer`;
  const chips: [TextEffect | null, HTMLButtonElement][] = [];
  const chip = (value: TextEffect | null, label: string) => {
    const c = mk(label, value ? `Efeito: ${label}` : 'Sem efeito', () => {
      opts.setEffect?.(sel(), value);
      playTextEffect(el, value);
      render();
    }, chipCss.replace(/^/, ';'));
    chips.push([value, c]);
    return c;
  };
  const group = (title: string, items: HTMLButtonElement[]) => {
    const g = doc.createElement('div');
    const t = doc.createElement('div');
    t.textContent = title;
    t.setAttribute('style', `opacity:.6;font-size:${px(11)};margin:0 0 ${px(4)} ${px(2)}`);
    const list = doc.createElement('div');
    list.setAttribute('style', `display:flex;flex-wrap:wrap;gap:${px(4)}`);
    list.append(...items);
    g.append(t, list);
    return g;
  };
  menu.append(group('Sem movimento', [chip(null, 'Sem efeito')]), ...TEXT_EFFECT_GROUPS.map((g) => group(g.title, g.items.map((i) => chip(i.value, i.label)))));
  // Velocidade do movimento: 0x a 2x (1x = normal); o efeito toca de novo ao soltar
  const speedRow = doc.createElement('div');
  speedRow.setAttribute('style', `display:flex;align-items:center;gap:${px(8)};padding:${px(4)} ${px(2)} 0`);
  const speedLabel = doc.createElement('span');
  speedLabel.setAttribute('style', `min-width:${px(92)};font-variant-numeric:tabular-nums`);
  const speed = doc.createElement('input');
  speed.type = 'range';
  speed.min = '0';
  speed.max = '2';
  speed.step = '0.05';
  speed.title = 'Velocidade do movimento (0x a 2x)';
  speed.setAttribute('style', `flex:1;accent-color:#2563eb;height:${px(18)};cursor:pointer`);
  const speedValue = () => Math.max(0.1, Number(speed.value) || 0.1);
  const showSpeed = () => (speedLabel.textContent = `Velocidade ${Number(speed.value).toFixed(2).replace(/0$/, '')}x`);
  speed.addEventListener('mousedown', (e) => e.stopPropagation());
  speed.addEventListener('input', () => {
    showSpeed();
    const v = speedValue();
    opts.setFxSpeed?.(sel(), Math.abs(v - 1) < 0.001 ? null : v);
  });
  speed.addEventListener('change', () => {
    const fx = saved().fx ?? null;
    if (fx) playTextEffect(el, fx);
  });
  const ticks = doc.createElement('span');
  ticks.textContent = '0x · 1x · 2x';
  ticks.setAttribute('style', `opacity:.55;font-size:${px(11)}`);
  speedRow.append(speedLabel, speed, ticks);
  if (opts.setFxSpeed) menu.append(group('Velocidade do movimento', []), speedRow);

  const tag = doc.createElement('span');
  tag.setAttribute('style', `opacity:.6;padding:0 ${px(6)}`);
  tag.textContent = opts.deviceLabel;

  const on = (b: HTMLButtonElement, active: boolean) => {
    b.style.background = active ? 'rgba(255,255,255,.22)' : 'transparent';
    b.setAttribute('aria-pressed', String(active));
  };
  function render() {
    const s = saved();
    font.value = s.font ?? '';
    value.textContent = `${size()}px`;
    on(bold, isBold());
    on(italic, isItalic());
    on(underline, isUnderline());
    color.value = s.text ?? cssColorToHex(cs().color) ?? '#000000';
    scopeBtn.textContent = scope === 'exact' ? 'Só este' : 'Todos iguais';
    bg.value = s.bg ?? cssColorToHex(cs().backgroundColor) ?? '#ffffff';
    speed.value = String(s.fxSpeed ?? 1);
    showSpeed();
    remove.textContent = s.hidden ? '↺ Restaurar' : '🗑 Excluir';
    remove.style.background = s.hidden ? '#16a34a' : 'rgba(239,68,68,.85)';
    effect.textContent = `✦ Efeito: ${s.fx ? EFFECT_LABEL.get(s.fx) ?? s.fx : 'nenhum'} ▾`;
    for (const [v, c] of chips) c.style.background = (s.fx ?? null) === v ? '#2563eb' : 'rgba(255,255,255,.1)';
  }
  // Valores que dependem do CSS recém-aplicado: lê depois do navegador redesenhar
  const later = (fn: () => void) => win.requestAnimationFrame(() => win.requestAnimationFrame(fn));

  // Alça para arrastar a barra para outro lugar (duplo clique volta ao automático, junto do elemento)
  const handle = doc.createElement('span');
  handle.textContent = '⠿';
  handle.title = 'Arraste para mudar a barra de lugar (duplo clique: volta para junto do elemento)';
  handle.setAttribute('style', `display:grid;place-items:center;width:${px(22)};height:${px(28)};border-radius:${px(6)};cursor:grab;opacity:.7;font-size:${px(16)};touch-action:none;user-select:none`);
  handle.addEventListener('mousedown', (e) => e.preventDefault());
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    handle.style.cursor = 'grabbing';
    const r = bar.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(ev.clientX - dx, win.innerWidth - bar.offsetWidth));
      const y = clampY(ev.clientY - dy);
      bar.style.left = `${x}px`;
      bar.style.top = `${y}px`;
      barPositions.set(doc, { x, y });
    };
    const up = () => {
      handle.style.cursor = 'grab';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    barPositions.delete(doc);
    place();
  });

  const top = row();
  top.append(handle, font, mk('A−', 'Diminuir fonte', () => setSize(Math.max(8, size() - step()))), value, mk('A+', 'Aumentar fonte', () => setSize(Math.min(160, size() + step()))), reset);
  const bottom = row();
  bottom.append(bold, italic, underline, color, scopeBtn, tag);
  bar.append(top, bottom);
  if (opts.setEffect) {
    const fxRow = row();
    fxRow.append(effect, bgLabel, bg);
    bar.append(fxRow, menu);
  }
  const actions = row();
  if (iconBtn) actions.append(iconBtn);
  if (parent) actions.append(parent);
  if (opts.setHidden) actions.append(remove);
  if (actions.children.length) bar.append(actions);
  render();
  doc.body.appendChild(bar);

  // A barra fica sempre na parte da prévia que aparece na tela, mesmo rolando a prévia ou a página do editor
  const clampY = (y: number) => {
    const band = visibleBand(win);
    return Math.max(band.top + 4, Math.min(y, band.bottom - bar.offsetHeight - 4));
  };
  const place = () => {
    // Barra arrastada pelo usuário: fica onde ele deixou (dentro da parte visível)
    const fixed = barPositions.get(doc);
    if (fixed) {
      bar.style.left = `${Math.max(0, Math.min(fixed.x, win.innerWidth - bar.offsetWidth))}px`;
      bar.style.top = `${clampY(fixed.y)}px`;
      return;
    }
    const r = el.getBoundingClientRect();
    const h = bar.offsetHeight;
    const y = r.top - h - 8 >= 4 ? r.top - h - 8 : r.bottom + 8;
    // Elementos altos (seções inteiras): a barra fica sempre dentro da tela
    bar.style.top = `${clampY(y)}px`;
    bar.style.left = `${Math.max(4, Math.min(r.left, win.innerWidth - bar.offsetWidth - 4))}px`;
  };
  place();
  const widthUi = attachWidthHandles(doc, el, opts, sel, px);
  win.addEventListener('scroll', place, true);
  win.addEventListener('resize', place);
  // Rolagem da página do editor (fora da prévia)
  let parentWin: Window | null = null;
  try {
    parentWin = win.parent !== win ? win.parent : null;
    parentWin?.addEventListener('scroll', place, true);
    parentWin?.addEventListener('resize', place);
  } catch {
    parentWin = null;
  }
  return {
    bar,
    close: () => {
      win.removeEventListener('scroll', place, true);
      win.removeEventListener('resize', place);
      parentWin?.removeEventListener('scroll', place, true);
      parentWin?.removeEventListener('resize', place);
      widthUi?.close();
      bar.remove();
    },
  };
}

const TEXT_W_MIN = 10;

/**
 * Alças azuis nas laterais do texto selecionado: arrastar estreita (ou alarga) a faixa do texto, com a
 * mesma letra. Texto centralizado encolhe pelos dois lados; alinhado à esquerda, só pela direita.
 * Vale para o layout mostrado (celular ou computador). Duplo clique numa alça volta à largura do modelo.
 */
function attachWidthHandles(doc: Document, el: HTMLElement, opts: TextSizeOptions, sel: () => string, px: (n: number) => string) {
  const win = doc.defaultView!;
  const display = win.getComputedStyle(el).display;
  // Só blocos (títulos, parágrafos, listas, cartões): texto dentro de botão/linha não tem faixa própria
  if (!/^(block|flex|grid|list-item|flow-root)$/.test(display) || !el.parentElement) return null;
  const centered = () => {
    const ta = win.getComputedStyle(el).textAlign;
    return ta === 'center' || ta === '-webkit-center';
  };
  const label = doc.createElement('div');
  label.dataset.lpUi = 'width';
  label.setAttribute('style', `position:fixed;z-index:9998;display:none;padding:${px(5)} ${px(9)};border-radius:999px;background:rgba(17,17,17,.85);color:#fff;font:600 ${px(12)}/1 system-ui,sans-serif;pointer-events:none;white-space:nowrap`);
  doc.body.appendChild(label);
  const sides: ('left' | 'right')[] = centered() ? ['left', 'right'] : ['right'];
  const handles = sides.map((side) => {
    const h = doc.createElement('div');
    h.dataset.lpUi = 'width';
    h.title = 'Arraste para diminuir ou aumentar a largura do texto (duplo clique: largura padrão)';
    h.setAttribute(
      'style',
      `position:fixed;z-index:9998;width:${px(12)};height:${px(40)};margin-top:-${px(20)};margin-left:-${px(6)};border-radius:999px;background:#2563eb;border:${px(2)} solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:ew-resize;touch-action:none`,
    );
    // Não tira o foco do texto em edição (senão a edição e a barra fecham no meio do arrasto)
    h.addEventListener('mousedown', (e) => e.preventDefault());
    h.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      opts.setStyle(sel(), { w: null, wc: null });
      win.requestAnimationFrame(() => win.requestAnimationFrame(placeHandles));
    });
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
      const parent = el.parentElement!;
      const pcs = win.getComputedStyle(parent);
      // Área disponível = largura útil do elemento de fora (100%)
      const available = parent.getBoundingClientRect().width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
      const startW = el.getBoundingClientRect().width;
      const both = centered();
      const sx = e.clientX;
      let pct = Math.min(100, (startW / available) * 100);
      label.style.display = 'block';
      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - sx) * (side === 'right' ? 1 : -1) * (both ? 2 : 1);
        pct = Math.min(100, Math.max(TEXT_W_MIN, ((startW + dx) / available) * 100));
        el.style.setProperty('max-width', `${pct}%`, 'important');
        if (both) {
          el.style.setProperty('margin-left', 'auto', 'important');
          el.style.setProperty('margin-right', 'auto', 'important');
        }
        label.textContent = `Largura ${Math.round(pct)}%`;
        placeHandles();
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        label.style.display = 'none';
        ['max-width', 'margin-left', 'margin-right'].forEach((p) => el.style.removeProperty(p));
        const w = Math.round(pct * 10) / 10;
        opts.setStyle(sel(), w >= 99.5 ? { w: null, wc: null } : { w, wc: both ? true : null });
        win.requestAnimationFrame(() => win.requestAnimationFrame(placeHandles));
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
    doc.body.appendChild(h);
    return { side, h };
  });
  function placeHandles() {
    const r = el.getBoundingClientRect();
    const y = r.top + Math.min(r.height, win.innerHeight) / 2;
    for (const { side, h } of handles) {
      h.style.left = `${side === 'left' ? r.left : r.right}px`;
      h.style.top = `${y}px`;
    }
    label.style.left = `${r.left + r.width / 2}px`;
    label.style.top = `${r.top - 14}px`;
    label.style.transform = 'translate(-50%,-100%)';
  }
  placeHandles();
  win.addEventListener('scroll', placeHandles, true);
  win.addEventListener('resize', placeHandles);
  return {
    close: () => {
      win.removeEventListener('scroll', placeHandles, true);
      win.removeEventListener('resize', placeHandles);
      handles.forEach(({ h }) => h.remove());
      label.remove();
    },
  };
}

/**
 * Faixa da prévia que está visível na tela do editor (coordenadas da prévia). A prévia é um iframe dentro
 * da página do editor: ao rolar o editor, parte dela sai da tela — barras e quadros ficam nessa faixa.
 */
export function visibleBand(win: Window): { top: number; bottom: number } {
  const all = { top: 0, bottom: win.innerHeight };
  try {
    const frame = win.frameElement as HTMLElement | null;
    const parent = win.parent;
    if (!frame || !parent || parent === win) return all;
    const r = frame.getBoundingClientRect();
    // Prévia de computador reduzida com transform: converte a medida da tela para a da prévia
    const scale = frame.offsetHeight ? r.height / frame.offsetHeight : 1;
    const top = Math.max(0, -r.top / scale);
    const bottom = Math.min(win.innerHeight, (parent.innerHeight - r.top) / scale);
    return bottom - top >= 60 ? { top, bottom } : all;
  } catch {
    return all;
  }
}

/** Ícones marcados com data-lp-icon: no modo Textos, clicar (no ícone ou na caixinha dele) abre o seletor. */
const iconPickers = new WeakMap<Document, (path: string) => void>();

/** Posição escolhida arrastando a barra (vale para as próximas barras da mesma prévia). */
const barPositions = new WeakMap<Document, { x: number; y: number }>();

/** O que foi clicado na prévia: o editor abre à direita a área com os campos daquela parte. */
export interface PreviewSelection {
  /** Seção da página ([data-section]); "header" = cabeçalho */
  section: string | null;
  /** Campo do conteúdo (data-lp-text) quando é um texto; ícone: caminho do campo "icon" */
  path: string | null;
  /** Elemento que contém textos (ex.: cartão): caminho do primeiro texto dentro dele */
  innerPath: string | null;
  /** Foto (topo, "Sobre", galeria, logotipo) */
  image: boolean;
  /** Ícones de redes sociais */
  socials: boolean;
}
const selectListeners = new WeakMap<Document, (s: PreviewSelection) => void>();
export function onPreviewSelect(doc: Document, fn: (s: PreviewSelection) => void) {
  selectListeners.set(doc, fn);
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpSelectAll) return;
  doc.body.dataset.lpSelectAll = '1';
  // Nos outros modos (Fotos, Mover, Seções, Espaços, Cores), clicar num elemento também leva o painel
  // da direita até os campos dele. Na janela e na captura: roda antes dos ouvintes que interrompem o clique
  win.addEventListener(
    'click',
    (e) => {
      if (currentMode(doc) === 'textos') return; // o modo Textos já avisa ao editar/selecionar
      let el = e.target instanceof win.Element ? (e.target as Element) : null;
      while (el && !(el instanceof win.HTMLElement)) el = el.parentElement;
      if (!el || el.closest('[data-lp-ui]') || el === doc.body || el === doc.documentElement) return;
      notifySelect(doc, el as HTMLElement);
    },
    true,
  );
}

// ─── Cor de fundo da seção ──────────────────────────────────────────
/** Seção clicada no fundo (fora dos textos e fotos): o editor abre a escolha da cor de fundo. */
export interface SectionPick {
  key: string;
  label: string;
  x: number;
  y: number;
}
const sectionPickers = new WeakMap<Document, (p: SectionPick) => void>();
export function onSectionPick(doc: Document, fn: (p: SectionPick) => void) {
  sectionPickers.set(doc, fn);
}
const SECTION_NAMES: Record<string, string> = {
  hero: 'Topo', header: 'Cabeçalho', footer: 'Rodapé', about: 'Sobre', services: 'Serviços', differentials: 'Diferenciais',
  products: 'Produtos', gallery: 'Galeria', testimonials: 'Depoimentos', faq: 'Perguntas frequentes', contact: 'Contato', final_cta: 'Chamada final',
};
/** Clique no fundo da seção: o próprio contêiner, a <section>/<header>/<footer> ou a área .container. */
function sectionAreaKey(el: HTMLElement): string | null {
  if (!el.matches('[data-section],section,header,footer,.section,.container,.hero,.site-header,.site-footer')) return null;
  const key = el.closest<HTMLElement>('[data-section]')?.dataset.section ?? (el.closest('.site-header') ? 'header' : el.closest('.site-footer') ? 'footer' : null);
  return key && /^(hero|header|footer|about|services|differentials|products|gallery|testimonials|faq|contact|final_cta|custom:[a-z0-9-]{1,40})$/.test(key) ? key : null;
}
function sectionLabel(doc: Document, key: string) {
  if (SECTION_NAMES[key]) return SECTION_NAMES[key];
  const title = doc.querySelector(`[data-section="${key}"] h2`)?.textContent?.trim();
  return title ? `"${title.slice(0, 40)}"` : 'Seção criada';
}
function notifySelect(doc: Document, el: HTMLElement) {
  const fn = selectListeners.get(doc);
  if (!fn) return;
  // Elemento sem texto (ex.: ✓ ao lado de um item): usa o texto do item que o contém; se esse item
  // tem um texto só, é exatamente aquele campo
  let near: string | null = null;
  for (let up = el.parentElement, i = 0; up && i < 3 && !near; up = up.parentElement, i++) {
    if (up.matches('[data-section],body')) break;
    const texts = up.querySelectorAll<HTMLElement>('[data-lp-text]');
    if (texts.length === 1) near = texts[0].dataset.lpText ?? null;
  }
  fn({
    section: el.closest<HTMLElement>('[data-section]')?.dataset.section ?? (el.closest('.site-header') ? 'header' : null),
    path:
      el.closest<HTMLElement>('[data-lp-text]')?.dataset.lpText ??
      el.closest<HTMLElement>('[data-lp-icon]')?.dataset.lpIcon ??
      (el.querySelector('[data-lp-text]') ? null : near),
    innerPath: el.querySelector<HTMLElement>('[data-lp-text]')?.dataset.lpText ?? null,
    image: el.tagName === 'IMG' || !!el.querySelector(':scope > img') || !!el.closest('.hero-media,.about-media,.gallery figure,.brand'),
    socials: !!el.closest('.socials'),
  });
}

export function attachIconPick(doc: Document, onPick: (path: string) => void) {
  iconPickers.set(doc, onPick);
  if (doc.body.dataset.lpIcons) return;
  doc.body.dataset.lpIcons = '1';
  doc.addEventListener(
    'click',
    (e) => {
      if (currentMode(doc) !== 'textos') return;
      const t = e.target as Element | null;
      const el = t?.closest?.<HTMLElement>('[data-lp-icon]') ?? t?.closest?.('.icon-box')?.querySelector<HTMLElement>('[data-lp-icon]');
      if (!el?.dataset.lpIcon) return;
      e.preventDefault();
      e.stopPropagation();
      // Com a barra de elementos, o ícone abre a barra (efeito, cores, excluir e "Trocar ícone")
      if (doc.body.dataset.lpElementBar) return;
      iconPickers.get(doc)?.(el.dataset.lpIcon);
    },
    true,
  );
}

export function attachTextEdit(doc: Document, onText: (path: string, value: string) => boolean, sizes?: TextSizeOptions) {
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpTexts) return;
  doc.body.dataset.lpTexts = '1';
  if (sizes) doc.body.dataset.lpElementBar = '1';
  let editing: { el: HTMLElement; original: string; cancelled: boolean; closeBar?: () => void; bar?: HTMLElement; unlisten?: () => void } | null = null;

  const finish = () => {
    if (!editing) return;
    const { el, original, cancelled, closeBar, unlisten } = editing;
    editing = null;
    unlisten?.();
    closeBar?.();
    if (doc.activeElement === el) el.blur();
    el.removeAttribute('contenteditable');
    const path = el.dataset.lpText!;
    const value = el.innerText.replace(/[ \t]+\n/g, '\n').trim();
    if (cancelled || value === original.trim()) {
      el.innerText = original;
      return;
    }
    if (!onText(path, value)) {
      el.innerText = original;
      return;
    }
    // O mesmo campo pode aparecer em mais de um lugar (ex.: botão do CTA, telefone no topo e no contato)
    const syncAll = (text: string) =>
      doc.querySelectorAll<HTMLElement>('[data-lp-text]').forEach((o) => {
        if (o.dataset.lpText === path) o.innerText = text;
      });
    if (value) {
      syncAll(value);
      return;
    }
    // Apagado: volta ao texto padrão/do cadastro, ou vira espaço vazio para escrever depois
    if (el.dataset.lpOrig !== undefined) {
      syncAll(el.dataset.lpOrig);
      return;
    }
    if (el.hasAttribute('data-lp-empty')) {
      syncAll('');
      return;
    }
    // Texto apagado: some da página (item de lista removido ou campo opcional vazio)
    const box = el.tagName === 'SPAN' && el.parentElement ? el.parentElement : el;
    box.style.display = 'none';
    el.removeAttribute('data-lp-text');
    // Itens seguintes da mesma lista passam a ter o índice anterior
    const m = /^(.*\.)(\d+)$/.exec(path);
    if (m) {
      const [, prefix, idx] = m;
      doc.querySelectorAll<HTMLElement>('[data-lp-text]').forEach((o) => {
        const rest = o.dataset.lpText!.startsWith(prefix) ? o.dataset.lpText!.slice(prefix.length) : null;
        const n = rest ? /^(\d+)(.*)$/.exec(rest) : null;
        if (n && Number(n[1]) > Number(idx)) o.dataset.lpText = `${prefix}${Number(n[1]) - 1}${n[2]}`;
      });
    }
  };

  // Qualquer outro elemento da página (foto, botão, cartão, seção...): mesma barra, sem editar o texto
  let picked: { el: HTMLElement; close: () => void } | null = null;
  const unpick = () => {
    if (!picked) return;
    picked.el.removeAttribute('data-lp-selected');
    picked.close();
    picked = null;
  };
  const pick = (el: HTMLElement, iconPath?: string) => {
    unpick();
    if (!sizes) return;
    el.setAttribute('data-lp-selected', '');
    notifySelect(doc, el);
    const tb = textToolbar(doc, el, sizes, {
      onIcon: iconPath && iconPickers.get(doc)
        ? () => {
            unpick();
            iconPickers.get(doc)?.(iconPath);
          }
        : undefined,
      onParent: () => {
        const up = el.parentElement;
        if (up && up !== doc.body && up !== doc.documentElement) pick(up);
      },
    });
    picked = { el, close: tb.close };
  };

  const start = (el: HTMLElement) => {
    unpick();
    if (editing?.el === el) return;
    notifySelect(doc, el);
    finish();
    editing = { el, original: el.innerText, cancelled: false };
    el.setAttribute('contenteditable', 'plaintext-only');
    // Navegadores sem "plaintext-only" recusam o valor: usa o modo comum (o texto é lido sem formatação)
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    const current = editing;
    if (sizes) {
      const tb = textToolbar(doc, el, sizes);
      current.bar = tb.bar;
      current.closeBar = tb.close;
    }
    // Usar a fonte ou a cor da barra tira o foco do texto sem encerrar a edição;
    // ela termina quando o foco sai do texto e da barra
    const outside = (to: EventTarget | null) => to !== el && !current.bar?.contains(to as Node);
    const onBlur = (e: FocusEvent) => outside(e.relatedTarget) && finish();
    el.addEventListener('blur', onBlur);
    current.bar?.addEventListener('focusout', onBlur);
    current.unlisten = () => {
      el.removeEventListener('blur', onBlur);
      current.bar?.removeEventListener('focusout', onBlur);
    };
  };

  // No mousedown (antes do navegador posicionar o cursor) para o cursor cair onde foi clicado
  doc.addEventListener(
    'mousedown',
    (e) => {
      if (currentMode(doc) !== 'textos') return unpick();
      const t = e.target as Element | null;
      const el = t?.closest?.<HTMLElement>('[data-lp-text]');
      if (el) return start(el);
      if (!t || t.closest('[data-lp-ui]')) return;
      // Ícone trocável: abre a barra do ícone (efeito, cores, excluir e "Trocar ícone")
      const icon = t.closest<HTMLElement>('[data-lp-icon]') ?? t.closest('.icon-box')?.querySelector<HTMLElement>('[data-lp-icon]');
      if (icon) {
        if (!sizes) return;
        finish();
        return pick(icon, icon.dataset.lpIcon);
      }
      // Desenho de ícone: seleciona o ícone inteiro, não um traço dele
      const svg = t.closest('svg');
      const node = (svg ? (svg.parentElement?.classList.contains('ico') ? svg.parentElement : svg) : t) as HTMLElement;
      if (node === doc.body || node === doc.documentElement) return unpick();
      finish();
      // Fundo da seção: abre a escolha da cor de fundo da seção inteira
      const sectionKey = sectionAreaKey(node);
      const onSection = sectionPickers.get(doc);
      if (sectionKey && onSection) {
        unpick();
        notifySelect(doc, node);
        onSection({ key: sectionKey, label: sectionLabel(doc, sectionKey), x: e.clientX, y: e.clientY });
        return;
      }
      pick(node);
    },
    true,
  );
  // Links, botões e perguntas não navegam nem abrem enquanto edita
  doc.addEventListener(
    'click',
    (e) => {
      if (currentMode(doc) !== 'textos') return;
      const t = e.target as Element | null;
      // O menu do celular (summary sem texto editável) continua abrindo para editar os links dele
      const summary = t?.closest?.('summary');
      if (t?.closest?.('a') || (summary && summary.querySelector('[data-lp-text]'))) e.preventDefault();
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (e) => {
      if (!editing) {
        if (e.key === 'Escape') unpick();
        return;
      }
      // Teclas dentro da barra (fonte, cor) são dela
      if (editing.bar?.contains(e.target as Node) && e.key !== 'Escape') return;
      if (e.key === 'Escape') {
        editing.cancelled = true;
        finish();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finish();
      } else if ((e.key === 'End' || e.key === 'Home') && !e.shiftKey) {
        // Dentro de botões (inline-flex) o Chrome não move o cursor com Home/End
        e.preventDefault();
        const range = doc.createRange();
        range.selectNodeContents(editing.el);
        range.collapse(e.key === 'Home');
        const sel = win.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else if (e.key === ' ') {
        // Espaço dentro de <summary>/<a> não deve abrir a pergunta nem acionar o link
        e.stopPropagation();
      }
    },
    true,
  );
}

/** Campos que podem ficar vazios (somem da página); os demais recusam texto vazio. */
const OPTIONAL_FIELDS = new Set(['eyebrow', 'subtitle', 'secondary_cta', 'benefit', 'caption']);

/**
 * Aplica no conteúdo um texto editado na prévia. `path` vem do data-lp-text:
 * "hero.headline", "services.items.2.name", "labels.header_cta", "custom.<id>.paragraphs.0"…
 * Devolve null quando o valor não é aceito (campo obrigatório vazio ou caminho inválido).
 */
export function applyTextEdit(content: LandingContent, path: string, raw: string): LandingContent | null {
  const value = raw.trim();
  const next = structuredClone(content);
  // Texto do cadastro trocado só nesta LP; vazio = volta ao cadastro
  if (path.startsWith('ov:')) {
    const overrides = { ...(next.overrides ?? {}) };
    if (value) overrides[path.slice(3)] = value;
    else delete overrides[path.slice(3)];
    next.overrides = overrides;
    return next;
  }
  // Título dos depoimentos quando a IA não criou a seção de texto
  if (path === 'testimonials.title' && !next.testimonials) {
    if (!value) return null;
    next.testimonials = { title: value };
    return next;
  }
  const parts = path.split('.');
  if (parts[0] === 'labels') {
    const labels = { ...(next.labels ?? {}) };
    if (value) labels[parts[1]] = value;
    else delete labels[parts[1]]; // vazio = volta ao rótulo padrão
    next.labels = labels;
    return next;
  }
  let target: unknown = next;
  let rest = parts;
  if (parts[0] === 'custom') {
    target = next.custom_sections?.find((c) => c.id === parts[1]);
    rest = parts.slice(2);
  }
  for (const k of rest.slice(0, -1)) {
    target = target && typeof target === 'object' ? (target as Record<string, unknown>)[k] : null;
  }
  const last = rest[rest.length - 1];
  if (Array.isArray(target)) {
    const i = Number(last);
    if (!Number.isInteger(i) || i < 0 || i >= target.length) return null;
    if (value) target[i] = value;
    else target.splice(i, 1);
    return next;
  }
  if (!target || typeof target !== 'object' || !(last in target)) return null;
  // Descrição do elemento "ícone" é opcional (nos elementos de texto, "text" é obrigatório)
  const optional = OPTIONAL_FIELDS.has(last) || (last === 'text' && (target as { type?: string }).type === 'icon');
  if (!value && !optional) return null;
  (target as Record<string, unknown>)[last] = value || null;
  return next;
}
