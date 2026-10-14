import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ImageLook } from '@/types';
import { PopupHeader, useDraggablePopup } from './ElementColorPopup';

const WIDTH = 312;
const HEX = /^#[0-9a-f]{6}$/i;

const SHADOWS: { value: ImageLook['sh']; label: string }[] = [
  { value: undefined, label: 'Modelo' },
  { value: 'none', label: 'Nenhuma' },
  { value: 'sm', label: 'Leve' },
  { value: 'md', label: 'Média' },
  { value: 'lg', label: 'Forte' },
];
const FILTERS: { value: ImageLook['fx']; label: string }[] = [
  { value: undefined, label: 'Nenhum' },
  { value: 'gray', label: 'Preto e branco' },
  { value: 'sepia', label: 'Sépia' },
  { value: 'bright', label: 'Mais vivo' },
  { value: 'contrast', label: 'Contraste' },
];

function Chips<T>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <button
          key={i.label}
          type="button"
          onClick={() => onChange(i.value)}
          className={cn('rounded-md border px-2 py-1 text-xs', value === i.value ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400')}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
        {label} <span className="font-normal text-zinc-400">{value}px</span>
      </span>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

/** Borda, cantos, sombra e filtro de uma foto (modo "Fotos"). Mostra na prévia enquanto escolhe. */
export function ImageStylePopup({
  saved,
  anchor,
  onDraft,
  onSave,
  onClose,
}: {
  saved: ImageLook | undefined;
  anchor: { x: number; y: number };
  onDraft: (look: ImageLook | null) => void;
  onSave: (look: ImageLook | null) => void;
  onClose: () => void;
}) {
  const [look, setLook] = useState<ImageLook>(saved ?? {});
  const set = (patch: Partial<ImageLook>) =>
    setLook((l) => Object.fromEntries(Object.entries({ ...l, ...patch }).filter(([, v]) => v !== undefined)) as ImageLook);
  const clean = (l: ImageLook): ImageLook | null => {
    const out: ImageLook = { ...l };
    if (!out.bw) {
      delete out.bw;
      delete out.bc;
    }
    return Object.keys(out).length ? out : null;
  };

  useEffect(() => {
    onDraft(clean(look));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const width = Math.min(WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.x + 12, window.innerWidth - width - 8));
  const estimated = 440;
  const top = anchor.y + 12 + estimated > window.innerHeight ? Math.max(8, anchor.y - estimated - 12) : anchor.y + 12;
  const drag = useDraggablePopup({ left, top }, width);
  const color = look.bc ?? '#ffffff';
  const changed = JSON.stringify(clean(look) ?? {}) !== JSON.stringify(saved ?? {});

  return createPortal(
    <div ref={drag.ref} className="fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl" style={{ left: drag.pos.left, top: drag.pos.top, width }} role="dialog" aria-label="Estilo da foto">
      <PopupHeader onGrab={drag.onGrab} onClose={onClose}>
        <p className="text-sm font-semibold">Estilo da foto</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">Vale para a foto em si (com zoom menor que 100%, o espaço em volta fica sem fundo nem sombra)</p>
      </PopupHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Slider label="Borda" value={look.bw ?? 0} max={40} onChange={(v) => set({ bw: v || undefined })} />
          {look.bw ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-600">Cor da borda</span>
              <input type="color" value={color} onChange={(e) => set({ bc: e.target.value.toLowerCase() })} className="h-8 w-12 cursor-pointer rounded border border-zinc-200 bg-white p-0.5" aria-label="Cor da borda" />
              <input
                key={color}
                defaultValue={color}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const hex = v.startsWith('#') ? v : `#${v}`;
                  if (HEX.test(hex)) set({ bc: hex.toLowerCase() });
                }}
                className="h-8 w-24 rounded-md border border-zinc-200 px-2 font-mono text-xs uppercase outline-none focus:border-zinc-400"
                maxLength={7}
              />
            </div>
          ) : null}
        </div>
        <div>
          <Slider label="Cantos arredondados" value={look.r ?? 0} max={300} onChange={(v) => set({ r: v })} />
          {look.r !== undefined ? (
            <button type="button" onClick={() => set({ r: undefined })} className="mt-1 text-[11px] text-zinc-400 hover:text-ink">Voltar aos cantos do modelo</button>
          ) : null}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Sombra</p>
          <Chips items={SHADOWS} value={look.sh} onChange={(v) => set({ sh: v })} />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Filtro</p>
          <Chips items={FILTERS} value={look.fx} onChange={(v) => set({ fx: v })} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {saved ? (
          <button type="button" onClick={() => onSave(null)} className="text-xs text-zinc-500 hover:text-red-600">Tirar estilo</button>
        ) : <span />}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => onSave(clean(look))} disabled={!changed}>Aplicar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
