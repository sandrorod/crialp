import type { ElementColor, ElementColors, LandingContent, SectionSpacing } from '@/types';

/** Ferramentas ativas na prévia: enquadrar fotos, arrastar seções ou escolher cores. */
export type PreviewMode = 'textos' | 'fotos' | 'secoes' | 'cores';

export const MOBILE_MAX = 767;

/** Mesmo CSS gerado na página publicada (apps/api/src/landing/elementColors.ts). */
export function elementColorsCss(colors: ElementColors | undefined): string {
  const rules = (map: Record<string, ElementColor> = {}) =>
    Object.entries(map)
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
  const desktop = rules(colors?.desktop);
  const mobile = rules(colors?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}

/** Mesmo CSS gerado na página publicada (apps/api/src/landing/spacing.ts). 0.85 = escala base dos modelos. */
export function sectionSpacingCss(s: SectionSpacing | undefined): string {
  const rule = (pct?: number) => (pct && pct < 100 ? `:root{--section-y-scale:${+((0.85 * pct) / 100).toFixed(4)}}` : '');
  const desktop = rule(s?.desktop);
  const mobile = rule(s?.mobile);
  return [desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '', mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : ''].join('');
}

/** Estilo dos controles do editor dentro da prévia (não existe na página publicada). */
const EDITOR_CSS = `
html:not(.lp-mode-fotos) [data-lp-ui="zoom"]{display:none!important}
html:not(.lp-mode-secoes) [data-lp-ui="section"]{display:none!important}
html.lp-mode-secoes main>[data-section]:not([data-section="hero"]):not([data-section="contact"]):not([data-section="final_cta"]){outline:2px dashed rgba(37,99,235,.45);outline-offset:-3px}
html:not(.lp-mode-fotos) [data-lp-drag-handle]{cursor:auto!important;touch-action:auto!important}
html.lp-mode-cores body *{cursor:crosshair!important}
html.lp-mode-textos [data-lp-text]{outline:1px dashed rgba(37,99,235,.55);outline-offset:3px;cursor:text!important;border-radius:2px}
html.lp-mode-textos [data-lp-text]:hover{outline:2px solid #2563eb}
html.lp-mode-textos [data-lp-text][contenteditable]:not([contenteditable="false"]){outline:2px solid #2563eb;background:rgba(37,99,235,.07);caret-color:#2563eb}
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
  root.classList.remove('lp-mode-textos', 'lp-mode-fotos', 'lp-mode-secoes', 'lp-mode-cores');
  root.classList.add(`lp-mode-${mode}`);
  // Respostas do FAQ ficam abertas para poderem ser editadas
  if (mode === 'textos') doc.querySelectorAll<HTMLDetailsElement>('.faq details').forEach((d) => (d.open = true));
}

export const currentMode = (doc: Document): PreviewMode =>
  (['textos', 'secoes', 'cores'] as const).find((m) => doc.documentElement.classList.contains(`lp-mode-${m}`)) ?? 'fotos';

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
const VOLATILE = new Set(['reveal', 'in', 'section-alt']);

/**
 * Elementos que existem só na prévia do editor (barras de controle e campos opcionais vazios):
 * não entram na contagem do :nth-child, senão o seletor não bateria com a página publicada.
 */
function editorOnly(c: Element) {
  if (c.hasAttribute('data-lp-ui')) return true;
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
  /** Tamanho salvo para o seletor no layout atual */
  getSize: (selector: string) => number | undefined;
  /** Salva (ou remove, com null) o tamanho do seletor no layout atual */
  setSize: (selector: string, size: number | null) => void;
  /** Layout mostrado na prévia (texto da barra) */
  deviceLabel: string;
  uiScale?: number;
}

/** Barra flutuante com A− / A+ sobre o texto em edição (só na prévia do editor). */
function sizeToolbar(doc: Document, el: HTMLElement, opts: TextSizeOptions) {
  const win = doc.defaultView!;
  const px = (n: number) => `${Math.round(n * (opts.uiScale ?? 1))}px`;
  const exact = selectorFor(el, true);
  const similar = selectorFor(el, false);
  let scope: 'exact' | 'similar' = opts.getSize(similar) !== undefined && opts.getSize(exact) === undefined ? 'similar' : 'exact';
  const sel = () => (scope === 'exact' ? exact : similar);
  const computed = () => Math.round(parseFloat(win.getComputedStyle(el).fontSize)) || 16;
  let size = opts.getSize(sel()) ?? computed();

  const bar = doc.createElement('div');
  bar.dataset.lpUi = 'size';
  bar.setAttribute('style', `position:fixed;z-index:9999;display:flex;align-items:center;gap:${px(2)};padding:${px(4)};border-radius:${px(10)};background:rgba(17,24,39,.94);color:#fff;font:500 ${px(12)}/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap`);
  const btnCss = `height:${px(28)};min-width:${px(28)};padding:0 ${px(8)};border:0;border-radius:${px(7)};background:transparent;color:#fff;font:600 ${px(13)}/1 system-ui,sans-serif;cursor:pointer`;
  const mk = (label: string, title: string, onClick: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('style', btnCss);
    // mousedown sem padrão: o texto continua em edição (sem perder o foco)
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  const value = doc.createElement('span');
  value.setAttribute('style', `min-width:${px(42)};text-align:center;font-variant-numeric:tabular-nums`);
  const tag = doc.createElement('span');
  tag.setAttribute('style', `opacity:.6;padding:0 ${px(6)}`);
  tag.textContent = opts.deviceLabel;
  const scopeBtn = mk('', 'Aplicar só neste texto ou em todos os textos iguais a este', () => {
    scope = scope === 'exact' ? 'similar' : 'exact';
    size = opts.getSize(sel()) ?? computed();
    render();
  });
  const render = () => {
    value.textContent = `${size}px`;
    scopeBtn.textContent = scope === 'exact' ? 'Só este' : 'Todos iguais';
  };
  const apply = (next: number | null) => {
    opts.setSize(sel(), next);
    if (next) size = next;
    else win.requestAnimationFrame(() => win.requestAnimationFrame(() => ((size = computed()), render())));
    render();
  };
  const step = () => (size < 24 ? 1 : 2);
  bar.append(
    mk('A−', 'Diminuir fonte', () => apply(Math.max(8, size - step()))),
    value,
    mk('A+', 'Aumentar fonte', () => apply(Math.min(160, size + step()))),
    mk('⟲', 'Tamanho original', () => apply(null)),
    scopeBtn,
    tag,
  );
  render();
  doc.body.appendChild(bar);

  const place = () => {
    const r = el.getBoundingClientRect();
    const h = bar.offsetHeight;
    const top = r.top - h - 8 >= 4 ? r.top - h - 8 : r.bottom + 8;
    bar.style.top = `${top}px`;
    bar.style.left = `${Math.max(4, Math.min(r.left, win.innerWidth - bar.offsetWidth - 4))}px`;
  };
  place();
  win.addEventListener('scroll', place, true);
  win.addEventListener('resize', place);
  return () => {
    win.removeEventListener('scroll', place, true);
    win.removeEventListener('resize', place);
    bar.remove();
  };
}

export function attachTextEdit(doc: Document, onText: (path: string, value: string) => boolean, sizes?: TextSizeOptions) {
  const win = doc.defaultView;
  if (!win || doc.body.dataset.lpTexts) return;
  doc.body.dataset.lpTexts = '1';
  let editing: { el: HTMLElement; original: string; cancelled: boolean; closeBar?: () => void } | null = null;

  const finish = () => {
    if (!editing) return;
    const { el, original, cancelled, closeBar } = editing;
    editing = null;
    closeBar?.();
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

  const start = (el: HTMLElement) => {
    if (editing?.el === el) return;
    finish();
    editing = { el, original: el.innerText, cancelled: false };
    el.setAttribute('contenteditable', 'plaintext-only');
    // Navegadores sem "plaintext-only" recusam o valor: usa o modo comum (o texto é lido sem formatação)
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.addEventListener('blur', finish, { once: true });
    if (sizes) editing.closeBar = sizeToolbar(doc, el, sizes);
  };

  // No mousedown (antes do navegador posicionar o cursor) para o cursor cair onde foi clicado
  doc.addEventListener(
    'mousedown',
    (e) => {
      if (currentMode(doc) !== 'textos') return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-lp-text]');
      if (el) start(el);
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
      if (!editing) return;
      if (e.key === 'Escape') {
        editing.cancelled = true;
        editing.el.blur();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editing.el.blur();
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
const OPTIONAL_FIELDS = new Set(['eyebrow', 'subtitle', 'secondary_cta', 'benefit']);

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
  if (!value && !OPTIONAL_FIELDS.has(last)) return null;
  (target as Record<string, unknown>)[last] = value || null;
  return next;
}
