import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import type { ImageFocus } from '@/types';

const DESKTOP_WIDTH = 1280;

type FocusMap = Record<string, ImageFocus>;

/**
 * Ajuste de corte direto na prévia: as fotos marcadas com data-lp-img (topo e "sobre")
 * podem ser arrastadas dentro do espaço delas; o ponto escolhido vira object-position.
 * A prévia é do mesmo domínio, então o editor acessa o documento do iframe.
 */
function attachFocusDrag(doc: Document, getFocus: () => FocusMap, onFocus: (url: string, focus: ImageFocus) => void) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  doc.querySelectorAll<HTMLImageElement>('img[data-lp-img]').forEach((img) => {
    const url = img.dataset.lpImg;
    if (!url || img.dataset.lpDrag) return;
    img.dataset.lpDrag = '1';
    img.draggable = false;
    const saved = getFocus()[url];
    if (saved) img.style.objectPosition = `${saved.x}% ${saved.y}%`;

    const handle = img.parentElement;
    if (!handle) return;
    handle.style.cursor = 'grab';
    handle.style.touchAction = 'none';
    handle.title = 'Arraste para ajustar o corte da foto';

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('a, button, summary')) return;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) return;
      e.preventDefault();
      const box = img.getBoundingClientRect();
      // Com object-fit: cover, só dá para mover no eixo em que a foto sobra além do espaço
      const scale = Math.max(box.width / nw, box.height / nh);
      const overflowX = nw * scale - box.width;
      const overflowY = nh * scale - box.height;
      const start = getFocus()[url] ?? { x: 50, y: 50 };
      const sx = e.clientX;
      const sy = e.clientY;
      let current = start;
      handle.setPointerCapture(e.pointerId);
      handle.style.cursor = 'grabbing';

      const move = (ev: PointerEvent) => {
        // Arrastar para a direita revela o lado esquerdo da foto (posição diminui)
        current = {
          x: overflowX > 1 ? clamp(start.x - ((ev.clientX - sx) / overflowX) * 100) : start.x,
          y: overflowY > 1 ? clamp(start.y - ((ev.clientY - sy) / overflowY) * 100) : start.y,
        };
        img.style.objectPosition = `${current.x}% ${current.y}%`;
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        handle.style.cursor = 'grab';
        if (current.x !== start.x || current.y !== start.y) {
          onFocus(url, { x: Math.round(current.x * 10) / 10, y: Math.round(current.y * 10) / 10 });
        }
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
 */
export function PreviewFrame({
  src,
  device,
  height,
  focus,
  onFocus,
}: {
  src: string;
  device: 'desktop' | 'mobile';
  height: number;
  focus?: FocusMap;
  onFocus?: (url: string, focus: ImageFocus) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Refs para os ouvintes do iframe sempre enxergarem o estado mais recente
  const focusRef = useRef(focus ?? {});
  focusRef.current = focus ?? {};
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLoad = (e: SyntheticEvent<HTMLIFrameElement>) => {
    if (!onFocusRef.current) return;
    const doc = e.currentTarget.contentDocument;
    if (!doc) return;
    attachFocusDrag(doc, () => focusRef.current, (url, f) => onFocusRef.current?.(url, f));
  };

  if (device === 'mobile') {
    return (
      <div ref={box} className="mx-auto w-[390px] max-w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
        <iframe title="Prévia da Landing Page" src={src} onLoad={onLoad} className="w-full border-0" style={{ height }} />
      </div>
    );
  }

  const scale = width ? Math.min(1, width / DESKTOP_WIDTH) : 1;
  return (
    <div ref={box} className="w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5" style={{ height }}>
      {width ? (
        <iframe
          title="Prévia da Landing Page"
          src={src}
          onLoad={onLoad}
          className="origin-top-left border-0"
          style={{ width: DESKTOP_WIDTH, height: height / scale, transform: `scale(${scale})` }}
        />
      ) : null}
    </div>
  );
}
