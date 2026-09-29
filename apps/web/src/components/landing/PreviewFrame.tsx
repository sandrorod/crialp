import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ElementColors, ImageFocus } from '@/types';
import { ElementColorPopup } from './ElementColorPopup';
import {
  attachColorPick,
  attachSectionDrag,
  currentMode,
  elementColorsCss,
  setColorsCss,
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
  device,
  height,
  focus,
  onFocus,
  mode = 'fotos',
  onReorder,
  sectionOrder,
  elementColors,
  onElementColors,
}: {
  src: string;
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
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<PickedElement | null>(null);
  // Refs para os ouvintes do iframe sempre enxergarem o estado mais recente
  const focusRef = useRef(focus ?? {});
  focusRef.current = focus ?? {};
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const orderRef = useRef(sectionOrder);
  orderRef.current = sectionOrder;
  const colorsRef = useRef(elementColors);
  colorsRef.current = elementColors;

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
    if (d?.head) setColorsCss(d, elementColorsCss(elementColors));
  }, [elementColors]);

  const scale = device === 'desktop' && width ? Math.min(1, width / DESKTOP_WIDTH) : 1;
  const uiScale = device === 'desktop' && width ? Math.max(1, DESKTOP_WIDTH / width) : 1;

  const onLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const d = e.currentTarget.contentDocument;
    if (!d) return;
    setupEditorDocument(d);
    setPreviewMode(d, modeRef.current);
    if (onFocusRef.current) attachFocusDrag(d, () => focusRef.current, (url, f) => onFocusRef.current?.(url, f), uiScale);
    setColorsCss(d, elementColorsCss(colorsRef.current));
    if (onReorderRef.current) attachSectionDrag(d, (keys) => onReorderRef.current?.(keys), uiScale, orderRef.current);
    if (onElementColors) attachColorPick(d, setPicked);
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
        <iframe ref={frame} title="Prévia da Landing Page" src={src} onLoad={onLoad} className="w-full border-0" style={{ height }} />
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
          onLoad={onLoad}
          className="origin-top-left border-0"
          style={{ width: DESKTOP_WIDTH, height: height / scale, transform: `scale(${scale})` }}
        />
      ) : null}
      {popup}
    </div>
  );
}
