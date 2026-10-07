import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ElementColor, ElementColors, ImageBox, ImageFocus, ImageSizes, SectionSpacing } from '@/types';
import { ElementColorPopup } from './ElementColorPopup';
import { readIconStyle, type IconPageStyle } from './IconPicker';
import {
  attachColorPick,
  attachIconPick,
  attachImageResize,
  attachMoveDrag,
  imageSizesCss,
  setImageSizeCss,
  attachSectionDrag,
  attachSpacingDrag,
  attachTextEdit,
  currentMode,
  elementColorsCss,
  sectionSpacingCss,
  loadElementFonts,
  applyTextEffects,
  onPreviewSelect,
  type PreviewSelection,
  setColorsCss,
  setSpacingCss,
  setDraftCss,
  setPreviewMode,
  setupEditorDocument,
  type PickedElement,
  type PreviewMode,
} from './previewTools';

const DESKTOP_WIDTH = 1280;

type FocusMap = Record<string, ImageFocus>;

/** Aplica o enquadramento na foto: mesma regra da renderização (object-position + zoom a partir do ponto). */
function applyFocus(img: HTMLImageElement, f: ImageFocus) {
  const pos = `${f.x}% ${f.y}%`;
  img.style.objectPosition = pos;
  img.style.transformOrigin = pos;
  img.style.transform = f.z && f.z > 1 ? `scale(${f.z})` : '';
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;

/**
 * Ajuste de enquadramento direto na prévia: as fotos marcadas com data-lp-img (topo e "sobre")
 * podem ser arrastadas dentro do espaço delas e ampliadas (botões − / + ou pinça no trackpad).
 * A prévia é do mesmo domínio, então o editor acessa o documento do iframe.
 */
function attachFocusDrag(doc: Document, getFocus: () => FocusMap, onFocus: (url: string, focus: ImageFocus) => void, uiScale = 1) {
  // A prévia desktop é reduzida para caber no painel: os controles crescem na mesma proporção
  const px = (n: number) => `${Math.round(n * uiScale)}px`;
  const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
  const round = (f: ImageFocus): ImageFocus => ({
    x: Math.round(f.x * 10) / 10,
    y: Math.round(f.y * 10) / 10,
    ...(f.z && f.z > 1 ? { z: Math.round(f.z * 100) / 100 } : {}),
  });

  doc.querySelectorAll<HTMLImageElement>('img[data-lp-img]').forEach((img) => {
    const url = img.dataset.lpImg;
    const handle = img.parentElement;
    if (!url || !handle || img.dataset.lpDrag) return;
    img.dataset.lpDrag = '1';
    img.draggable = false;
    const current = (): ImageFocus => getFocus()[url] ?? { x: 50, y: 50 };
    applyFocus(img, current());

    handle.style.cursor = 'grab';
    handle.style.touchAction = 'none';
    handle.dataset.lpDragHandle = '1';
    handle.title = 'Arraste para ajustar o enquadramento da foto';
    if (doc.defaultView?.getComputedStyle(handle).position === 'static') handle.style.position = 'relative';

    /**
     * Quanto a foto sobra além do espaço em cada eixo (com object-fit: cover e o zoom).
     * O deslocamento visível é linear no ponto (0–100%) com amplitude igual a essa sobra.
     */
    const overflow = (z: number) => {
      const box = handle.getBoundingClientRect();
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const cover = Math.max(box.width / nw, box.height / nh);
      return { x: nw * cover * z - box.width, y: nh * cover * z - box.height };
    };

    const setZoom = (z: number) => {
      const f = current();
      const next = round({ ...f, z: clamp(z, ZOOM_MIN, ZOOM_MAX) });
      applyFocus(img, next);
      onFocus(url, next);
    };

    // Barra de zoom (só existe na prévia do editor, não na página publicada)
    const bar = doc.createElement('div');
    bar.dataset.lpUi = 'zoom';
    bar.setAttribute('style', `position:absolute;right:${px(10)};bottom:${px(10)};z-index:5;display:flex;gap:${px(4)};padding:${px(4)};border-radius:999px;background:rgba(17,17,17,.72);backdrop-filter:blur(6px);box-shadow:0 6px 18px rgba(0,0,0,.25)`);
    const mkButton = (label: string, title: string, onClick: () => void) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.setAttribute('style', `width:${px(30)};height:${px(30)};border:0;border-radius:999px;background:transparent;color:#fff;font:600 ${px(17)}/1 system-ui,sans-serif;cursor:pointer`);
      b.addEventListener('mouseenter', () => (b.style.background = 'rgba(255,255,255,.18)'));
      b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    bar.append(
      mkButton('−', 'Diminuir zoom', () => setZoom((current().z ?? 1) - ZOOM_STEP)),
      mkButton('+', 'Aumentar zoom', () => setZoom((current().z ?? 1) + ZOOM_STEP)),
      mkButton('⟲', 'Restaurar enquadramento', () => {
        const reset = { x: 50, y: 50 };
        applyFocus(img, reset);
        onFocus(url, reset);
      }),
    );
    handle.appendChild(bar);

    // Pinça no trackpad (o navegador envia wheel com ctrlKey); rolagem comum continua rolando a página
    handle.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey || currentMode(doc) !== 'fotos') return;
        e.preventDefault();
        setZoom((current().z ?? 1) * Math.exp(-e.deltaY / 200));
      },
      { passive: false },
    );

    handle.addEventListener('pointerdown', (e) => {
      if (currentMode(doc) !== 'fotos' || e.button !== 0 || (e.target as Element).closest('a, button, summary')) return;
      if (!img.naturalWidth || !img.naturalHeight) return;
      e.preventDefault();
      const start = current();
      const over = overflow(start.z ?? 1);
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = start;
      handle.setPointerCapture(e.pointerId);
      handle.style.cursor = 'grabbing';

      const move = (ev: PointerEvent) => {
        // Arrastar para a direita/baixo revela o lado esquerdo/de cima da foto (a posição diminui)
        moved = {
          ...start,
          x: over.x > 1 ? clamp(start.x - ((ev.clientX - sx) / over.x) * 100) : start.x,
          y: over.y > 1 ? clamp(start.y - ((ev.clientY - sy) / over.y) * 100) : start.y,
        };
        applyFocus(img, moved);
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        handle.style.cursor = 'grab';
        if (moved.x !== start.x || moved.y !== start.y) onFocus(url, round(moved));
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  });
}

/**
 * Prévia fiel: no modo desktop a página é renderizada a 1280px e reduzida
 * proporcionalmente para caber no painel; no modo celular, 390px reais.
 * Ferramentas: enquadrar fotos, arrastar seções e escolher cores clicando nos elementos.
 */
export function PreviewFrame({
  src,
  html,
  device,
  height,
  focus,
  onFocus,
  mode = 'textos',
  onReorder,
  sectionOrder,
  elementColors,
  onElementColors,
  onText,
  onSelect,
  onIcon,
  sectionSpacing,
  onSpacing,
  imageSize,
  onImageSize,
}: {
  src: string;
  /** HTML do rascunho (mudanças ainda não salvas); ausente = página salva em `src` */
  html?: string | null;
  device: 'desktop' | 'mobile';
  height: number;
  focus?: FocusMap;
  onFocus?: (url: string, focus: ImageFocus) => void;
  mode?: PreviewMode;
  /** Nova ordem das seções móveis (sem topo, contato e CTA final) */
  onReorder?: (keys: string[]) => void;
  /** Ordem atual (inclusive não salva) aplicada ao carregar a prévia */
  sectionOrder?: string[];
  elementColors?: ElementColors;
  onElementColors?: (colors: ElementColors) => void;
  /** Texto editado direto na prévia; false = valor recusado (volta o original) */
  onText?: (path: string, value: string) => boolean;
  /** Elemento clicado na prévia (o editor mostra à direita os campos daquela parte) */
  onSelect?: (s: PreviewSelection) => void;
  /** Ícone clicado na prévia (modo Textos): caminho do campo e o estilo dos ícones da página */
  onIcon?: (path: string, style: IconPageStyle | undefined) => void;
  /** Margem interna das seções (inclusive não salva), aplicada na hora */
  sectionSpacing?: SectionSpacing;
  /** Espaço de uma seção arrastado na prévia (null = volta ao padrão) */
  onSpacing?: (key: string, pct: number | null) => void;
  /** Tamanho das fotos (inclusive não salvo), aplicado na hora */
  imageSize?: ImageSizes;
  /** Foto redimensionada na prévia (modo Fotos), no layout atual; null = volta ao padrão */
  onImageSize?: (url: string, box: ImageBox | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<PickedElement | null>(null);
  // Posição da rolagem, mantida quando a prévia é recarregada com o rascunho
  const scrollY = useRef(0);
  // Refs para os ouvintes do iframe sempre enxergarem o estado mais recente
  const focusRef = useRef(focus ?? {});
  focusRef.current = focus ?? {};
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onIconRef = useRef(onIcon);
  onIconRef.current = onIcon;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const orderRef = useRef(sectionOrder);
  orderRef.current = sectionOrder;
  const colorsRef = useRef(elementColors);
  colorsRef.current = elementColors;
  const imageSizeRef = useRef(imageSize);
  imageSizeRef.current = imageSize;
  const onImageSizeRef = useRef(onImageSize);
  onImageSizeRef.current = onImageSize;
  const onSpacingRef = useRef(onSpacing);
  onSpacingRef.current = onSpacing;
  const spacingRef = useRef(sectionSpacing);
  spacingRef.current = sectionSpacing;
  const onColorsRef = useRef(onElementColors);
  onColorsRef.current = onElementColors;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doc = () => frame.current?.contentDocument ?? null;

  useEffect(() => {
    const d = doc();
    if (d?.documentElement) setPreviewMode(d, mode);
    if (mode !== 'cores') setPicked(null);
  }, [mode]);

  // Cores salvas no editor aparecem na hora, sem esperar salvar a página
  useEffect(() => {
    const d = doc();
    if (d?.head) {
      setColorsCss(d, elementColorsCss(elementColors));
      loadElementFonts(d, elementColors);
      applyTextEffects(d, elementColors, device);
    }
  }, [elementColors]);

  useEffect(() => {
    const d = doc();
    if (d?.head) setSpacingCss(d, sectionSpacingCss(sectionSpacing));
  }, [sectionSpacing]);

  useEffect(() => {
    const d = doc();
    if (d?.head) setImageSizeCss(d, imageSizesCss(imageSize));
  }, [imageSize]);

  const scale = device === 'desktop' && width ? Math.min(1, width / DESKTOP_WIDTH) : 1;
  const uiScale = device === 'desktop' && width ? Math.max(1, DESKTOP_WIDTH / width) : 1;

  const onLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const d = e.currentTarget.contentDocument;
    if (!d) return;
    const win = d.defaultView;
    if (win) {
      if (scrollY.current) win.scrollTo({ top: scrollY.current, behavior: 'instant' });
      win.addEventListener('scroll', () => (scrollY.current = win.scrollY), { passive: true });
    }
    setupEditorDocument(d);
    onPreviewSelect(d, (s) => onSelectRef.current?.(s));
    setPreviewMode(d, modeRef.current);
    if (onFocusRef.current) attachFocusDrag(d, () => focusRef.current, (url, f) => onFocusRef.current?.(url, f), uiScale);
    setColorsCss(d, elementColorsCss(colorsRef.current));
    loadElementFonts(d, colorsRef.current);
    applyTextEffects(d, colorsRef.current, device);
    setSpacingCss(d, sectionSpacingCss(spacingRef.current));
    setImageSizeCss(d, imageSizesCss(imageSizeRef.current));
    if (onImageSizeRef.current) {
      attachImageResize(d, (url) => imageSizeRef.current?.[device]?.[url], (url, box) => onImageSizeRef.current?.(url, box), uiScale);
    }
    if (onSpacingRef.current) attachSpacingDrag(d, (key, pct) => onSpacingRef.current?.(key, pct), uiScale);
    if (onReorderRef.current) attachSectionDrag(d, (keys) => onReorderRef.current?.(keys), uiScale, orderRef.current);
    if (onElementColors) attachColorPick(d, setPicked);
    if (onElementColors) {
      // Modo "Mover": a posição arrastada fica junto do estilo do elemento, no layout atual
      attachMoveDrag(
        d,
        (sel) => {
          const c = colorsRef.current?.[device]?.[sel];
          return c?.mx || c?.my ? { mx: c.mx ?? 0, my: c.my ?? 0 } : undefined;
        },
        (sel, off) => {
          const all = colorsRef.current ?? { desktop: {}, mobile: {} };
          const map = { ...all[device] };
          const entry: ElementColor = { ...(map[sel] ?? {}) };
          delete entry.mx;
          delete entry.my;
          if (off?.mx) entry.mx = off.mx;
          if (off?.my) entry.my = off.my;
          if (Object.keys(entry).length) map[sel] = entry;
          else delete map[sel];
          const next = { ...all, [device]: map };
          colorsRef.current = next;
          onColorsRef.current?.(next);
        },
      );
    }
    if (onIconRef.current) attachIconPick(d, (path) => onIconRef.current?.(path, readIconStyle(d)));
    if (onTextRef.current) {
      attachTextEdit(
        d,
        (path, value) => onTextRef.current?.(path, value) ?? false,
        onColorsRef.current
          ? {
              uiScale,
              deviceLabel: device === 'mobile' ? 'Celular' : 'Computador',
              getStyle: (sel) => colorsRef.current?.[device]?.[sel],
              // Estilo do texto fica junto das cores do elemento, por layout (celular / computador)
              setStyle: (sel, patch) => {
                const all = colorsRef.current ?? { desktop: {}, mobile: {} };
                const map = { ...all[device] };
                const entry: Record<string, unknown> = { ...(map[sel] ?? {}) };
                for (const [k, v] of Object.entries(patch)) {
                  if (v === null || v === undefined) delete entry[k];
                  else entry[k] = v;
                }
                if (Object.keys(entry).length) map[sel] = entry as ElementColor;
                else delete map[sel];
                const next = { ...all, [device]: map };
                colorsRef.current = next;
                onColorsRef.current?.(next);
              },
              // Efeito de movimento: o mesmo no celular e no computador
              setEffect: (sel, fx) => {
                const all = colorsRef.current ?? { desktop: {}, mobile: {} };
                const next = { ...all };
                for (const layout of ['desktop', 'mobile'] as const) {
                  const map = { ...all[layout] };
                  const entry: ElementColor = { ...(map[sel] ?? {}) };
                  if (fx) entry.fx = fx;
                  else delete entry.fx;
                  if (Object.keys(entry).length) map[sel] = entry;
                  else delete map[sel];
                  next[layout] = map;
                }
                colorsRef.current = next;
                onColorsRef.current?.(next);
              },
              // Excluir/restaurar elemento: vale no celular e no computador
              setHidden: (sel, hidden) => {
                const all = colorsRef.current ?? { desktop: {}, mobile: {} };
                const next = { ...all };
                for (const layout of ['desktop', 'mobile'] as const) {
                  const map = { ...all[layout] };
                  const entry: ElementColor = { ...(map[sel] ?? {}) };
                  if (hidden) entry.hidden = true;
                  else delete entry.hidden;
                  if (Object.keys(entry).length) map[sel] = entry;
                  else delete map[sel];
                  next[layout] = map;
                }
                colorsRef.current = next;
                onColorsRef.current?.(next);
              },
              // Velocidade do efeito: a mesma no celular e no computador
              setFxSpeed: (sel, speed) => {
                const all = colorsRef.current ?? { desktop: {}, mobile: {} };
                const next = { ...all };
                for (const layout of ['desktop', 'mobile'] as const) {
                  const map = { ...all[layout] };
                  const entry: ElementColor = { ...(map[sel] ?? {}) };
                  if (speed) entry.fxSpeed = speed;
                  else delete entry.fxSpeed;
                  if (Object.keys(entry).length) map[sel] = entry;
                  else delete map[sel];
                  next[layout] = map;
                }
                colorsRef.current = next;
                onColorsRef.current?.(next);
              },
            }
          : undefined,
      );
    }
  };

  const popup =
    picked && onElementColors && frame.current ? (
      <ElementColorPopup
        key={picked.exact}
        picked={picked}
        device={device}
        colors={elementColors ?? { desktop: {}, mobile: {} }}
        anchor={(() => {
          const r = frame.current.getBoundingClientRect();
          return { x: r.left + picked.x * scale, y: r.top + picked.y * scale };
        })()}
        onDraft={(css) => {
          const d = doc();
          if (d) setDraftCss(d, css);
        }}
        onSave={(next) => {
          onElementColors(next);
          const d = doc();
          if (d) setDraftCss(d, '');
          setPicked(null);
        }}
        onClose={() => {
          const d = doc();
          if (d) setDraftCss(d, '');
          setPicked(null);
        }}
      />
    ) : null;

  if (device === 'mobile') {
    return (
      <div ref={box} className="mx-auto w-[390px] max-w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
        <iframe ref={frame} title="Prévia da Landing Page" src={src} srcDoc={html ?? undefined} onLoad={onLoad} className="w-full border-0" style={{ height }} />
        {popup}
      </div>
    );
  }

  return (
    <div ref={box} className="w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5" style={{ height }}>
      {width ? (
        <iframe
          ref={frame}
          title="Prévia da Landing Page"
          src={src}
          srcDoc={html ?? undefined}
          onLoad={onLoad}
          className="origin-top-left border-0"
          style={{ width: DESKTOP_WIDTH, height: height / scale, transform: `scale(${scale})` }}
        />
      ) : null}
      {popup}
    </div>
  );
}
