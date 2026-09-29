import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, RotateCcw, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ElementColor, ElementColors } from '@/types';
import type { PickedElement } from './previewTools';

type Device = 'desktop' | 'mobile';
const HEX = /^#[0-9a-f]{6}$/i;
const WIDTH = 312;

function ColorRow({ label, value, original, changed, onChange, onReset }: { label: string; value: string; original: string; changed: boolean; onChange: (v: string) => void; onReset: () => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600">{label}</span>
        {changed ? (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-ink">
            <RotateCcw className="size-3" /> original
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 flex-none cursor-pointer rounded border border-zinc-200 bg-white p-0.5" aria-label={label} />
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith('#') ? v : `#${v}`;
            if (HEX.test(hex)) onChange(hex.toLowerCase());
          }}
          className="h-9 w-full rounded-md border border-zinc-200 px-2 font-mono text-xs uppercase outline-none focus:border-zinc-400"
          maxLength={7}
        />
        <span className="size-9 flex-none rounded border border-zinc-200" style={{ background: original }} title={`Original: ${original}`} />
      </div>
    </div>
  );
}

/** Popup aberto ao clicar num elemento da prévia: escolhe cor do texto e do fundo e salva. */
export function ElementColorPopup({
  picked,
  device,
  colors,
  anchor,
  onDraft,
  onSave,
  onClose,
}: {
  picked: PickedElement;
  device: Device;
  colors: ElementColors;
  anchor: { x: number; y: number };
  onDraft: (css: string) => void;
  onSave: (colors: ElementColors) => void;
  onClose: () => void;
}) {
  const other: Device = device === 'mobile' ? 'desktop' : 'mobile';
  const [scope, setScope] = useState<'exact' | 'similar'>(() => (colors[device][picked.similar] && !colors[device][picked.exact] ? 'similar' : 'exact'));
  const selector = scope === 'exact' ? picked.exact : picked.similar;
  const saved: ElementColor | undefined = colors[device][selector];
  const [text, setText] = useState<string | null>(saved?.text ?? null);
  const [bg, setBg] = useState<string | null>(saved?.bg ?? null);
  const [both, setBoth] = useState(false);

  // Ao trocar o alcance, carrega o que já estava salvo para ele
  useEffect(() => {
    const s = colors[device][selector];
    setText(s?.text ?? null);
    setBg(s?.bg ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);

  // Mostra a cor na prévia enquanto escolhe
  useEffect(() => {
    const decl = [text ? `color:${text}!important` : '', bg ? `background-color:${bg}!important` : ''].filter(Boolean).join(';');
    onDraft(decl ? `${selector}{${decl}}` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, text, bg]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const write = (entry: ElementColor | null) => {
    const next: ElementColors = { desktop: { ...colors.desktop }, mobile: { ...colors.mobile } };
    for (const d of both ? [device, other] : [device]) {
      if (entry && (entry.text || entry.bg)) next[d][selector] = entry;
      else delete next[d][selector];
    }
    onSave(next);
  };

  const left = Math.min(Math.max(8, anchor.x + 12), window.innerWidth - WIDTH - 8);
  const estimated = 420;
  const top = anchor.y + 12 + estimated > window.innerHeight ? Math.max(8, anchor.y - estimated - 12) : anchor.y + 12;
  const DeviceIcon = device === 'mobile' ? Smartphone : Monitor;

  return createPortal(
    <div className="fixed z-50 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl" style={{ left, top, width: WIDTH }} role="dialog" aria-label="Alterar cor do elemento">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{picked.label}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <DeviceIcon className="size-3" /> Layout de {device === 'mobile' ? 'celular' : 'computador'}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-ink" aria-label="Fechar"><X className="size-4" /></button>
      </div>

      {picked.similar !== picked.exact ? (
        <div className="mb-3 flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
          {([['exact', 'Só este'], ['similar', 'Todos iguais a este']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={cn('flex-1 rounded-md px-2 py-1.5', scope === k ? 'bg-white shadow-sm' : 'text-zinc-500')}>{l}</button>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <ColorRow label="Cor da fonte (texto)" value={text ?? picked.text} original={picked.text} changed={!!text} onChange={setText} onReset={() => setText(null)} />
        <ColorRow label={picked.bgTransparent ? 'Cor de fundo (hoje transparente)' : 'Cor de fundo'} value={bg ?? picked.bg} original={picked.bg} changed={!!bg} onChange={setBg} onReset={() => setBg(null)} />
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
        <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="accent-zinc-900" />
        Aplicar também no layout de {other === 'mobile' ? 'celular' : 'computador'}
      </label>

      <div className="mt-4 flex items-center justify-between gap-2">
        {saved ? (
          <button type="button" onClick={() => write(null)} className="text-xs text-zinc-500 hover:text-red-600">Remover cor salva</button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => write({ ...(text ? { text } : {}), ...(bg ? { bg } : {}) })} disabled={!text && !bg && !saved}>Salvar cor</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
