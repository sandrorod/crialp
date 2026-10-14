import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ImageLook, TextEffect } from '@/types';
import { PopupHeader, useDraggablePopup } from './ElementColorPopup';
import { TEXT_EFFECT_GROUPS } from './previewTools';

// Largo o bastante para cada grupo de opções (filtros, sombras, links) caber numa linha só
const WIDTH = 440;
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
    <div className="flex flex-nowrap gap-1">
      {items.map((i) => (
        <button
          key={i.label}
          type="button"
          onClick={() => onChange(i.value)}
          className={cn('whitespace-nowrap rounded-md border px-2 py-1 text-xs', value === i.value ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400')}
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

const ZOOM_MIN = 10;
const ZOOM_MAX = 300;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Quadro aberto ao clicar numa foto da prévia (em qualquer modo): só as opções da foto —
 * enquadramento e zoom, corte, borda, cantos, sombra, filtro, efeito e excluir. Tudo vale na hora.
 */
export function ImagePopup({
  anchor,
  deviceLabel,
  zoom,
  onZoom,
  onResetFocus,
  hasSize,
  onResetSize,
  look,
  onLook,
  effect,
  onEffect,
  hidden,
  onHidden,
  onClose,
}: {
  anchor: { x: number; y: number };
  deviceLabel: string;
  /** Zoom atual (1 = 100%) */
  zoom: number;
  onZoom: (z: number) => void;
  onResetFocus: () => void;
  /** Foto com tamanho/corte próprio neste layout */
  hasSize: boolean;
  onResetSize: () => void;
  look: ImageLook | undefined;
  onLook: (look: ImageLook | null) => void;
  effect: TextEffect | null;
  onEffect: (fx: TextEffect | null) => void;
  hidden: boolean;
  onHidden: (hidden: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ImageLook>(look ?? {});
  const [pct, setPct] = useState(Math.round(zoom * 100));
  useEffect(() => setPct(Math.round(zoom * 100)), [zoom]);
  const set = (patch: Partial<ImageLook>) => {
    const next = Object.fromEntries(Object.entries({ ...draft, ...patch }).filter(([, v]) => v !== undefined)) as ImageLook;
    if (!next.bw) {
      delete next.bw;
      delete next.bc;
    }
    setDraft(next);
    onLook(Object.keys(next).length ? next : null);
  };
  const zoomTo = (p: number) => {
    const v = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(p)));
    setPct(v);
    onZoom(v / 100);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const width = Math.min(WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.x + 12, window.innerWidth - width - 8));
  const estimated = 560;
  const top = anchor.y + 12 + estimated > window.innerHeight ? Math.max(8, anchor.y - estimated - 12) : anchor.y + 12;
  const drag = useDraggablePopup({ left, top }, width);
  const color = draft.bc ?? '#ffffff';

  return createPortal(
    <div ref={drag.ref} className="fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl" style={{ left: drag.pos.left, top: drag.pos.top, width }} role="dialog" aria-label="Opções da foto">
      <PopupHeader onGrab={drag.onGrab} onClose={onClose}>
        <p className="text-sm font-semibold">Foto</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">As mudanças aparecem na hora</p>
      </PopupHeader>
      <div className="space-y-3">
        <Section title="Enquadramento">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => zoomTo(pct - (pct <= 100 ? 10 : 20))} className="size-8 flex-none rounded-md border border-zinc-200 text-sm hover:border-zinc-400" aria-label="Diminuir zoom">−</button>
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} value={pct} onChange={(e) => zoomTo(Number(e.target.value))} className="w-full" aria-label="Zoom" />
            <button type="button" onClick={() => zoomTo(pct + (pct < 100 ? 10 : 20))} className="size-8 flex-none rounded-md border border-zinc-200 text-sm hover:border-zinc-400" aria-label="Aumentar zoom">+</button>
            <span className="w-11 flex-none text-right text-xs tabular-nums text-zinc-500">{pct}%</span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <button type="button" onClick={onResetFocus} className="whitespace-nowrap text-[11px] text-zinc-500 hover:text-ink">⟲ Restaurar enquadramento</button>
            {hasSize ? (
              <button type="button" onClick={onResetSize} className="whitespace-nowrap text-[11px] text-zinc-500 hover:text-ink">Tirar corte e tamanho ({deviceLabel.toLowerCase()})</button>
            ) : null}
          </div>
          <p className="text-[11px] text-zinc-400">Para enquadrar ou cortar, use o modo Fotos: arraste a foto ou as alças azuis das bordas.</p>
        </Section>
        <Section title="Estilo">
          <Slider label="Borda" value={draft.bw ?? 0} max={40} onChange={(v) => set({ bw: v || undefined })} />
          {draft.bw ? (
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
          <div>
            <Slider label="Cantos arredondados" value={draft.r ?? 0} max={300} onChange={(v) => set({ r: v })} />
            {draft.r !== undefined ? (
              <button type="button" onClick={() => set({ r: undefined })} className="mt-1 text-[11px] text-zinc-400 hover:text-ink">Voltar aos cantos do modelo</button>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600">Sombra</p>
            <Chips items={SHADOWS} value={draft.sh} onChange={(v) => set({ sh: v })} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600">Filtro</p>
            <Chips items={FILTERS} value={draft.fx} onChange={(v) => set({ fx: v })} />
          </div>
          {Object.keys(draft).length ? (
            <button type="button" onClick={() => (setDraft({}), onLook(null))} className="text-[11px] text-zinc-500 hover:text-ink">Tirar estilo</button>
          ) : null}
        </Section>
        <Section title="Efeito ao aparecer">
          <select
            value={effect ?? ''}
            onChange={(e) => onEffect((e.target.value || null) as TextEffect | null)}
            className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-zinc-400"
            aria-label="Efeito ao aparecer"
          >
            <option value="">Sem efeito</option>
            {TEXT_EFFECT_GROUPS.map((g) => (
              <optgroup key={g.title} label={g.title}>
                {g.items.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Section>
      </div>
      <div className="mt-3 border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={() => {
            if (!hidden && !window.confirm('Tem certeza de que deseja apagar esta foto da página? (dá para restaurar depois)')) return;
            onHidden(!hidden);
          }}
          className={cn('whitespace-nowrap text-xs', hidden ? 'text-green-700 hover:underline' : 'text-zinc-500 hover:text-red-600')}
        >
          {hidden ? '↺ Restaurar foto' : '🗑 Excluir foto'}
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={onClose}>Pronto</Button>
      </div>
    </div>,
    document.body,
  );
}
