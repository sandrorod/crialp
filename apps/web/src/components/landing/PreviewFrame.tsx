import { useEffect, useRef, useState } from 'react';

const DESKTOP_WIDTH = 1280;

/**
 * Prévia fiel: no modo desktop a página é renderizada a 1280px e reduzida
 * proporcionalmente para caber no painel; no modo celular, 390px reais.
 */
export function PreviewFrame({ src, device, height }: { src: string; device: 'desktop' | 'mobile'; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (device === 'mobile') {
    return (
      <div ref={box} className="mx-auto w-[390px] max-w-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
        <iframe title="Prévia da Landing Page" src={src} className="w-full border-0" style={{ height }} />
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
          className="origin-top-left border-0"
          style={{ width: DESKTOP_WIDTH, height: height / scale, transform: `scale(${scale})` }}
        />
      ) : null}
    </div>
  );
}
