import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { normalizeLinkUrl } from '@/lib/richText';
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
          className={cn(
            'whitespace-nowrap rounded-md border px-2 py-1 text-xs',
            value === i.value ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400',
          )}
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
      <p className="mb-2 text-xs font-semibold text-zinc-700">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Quadro aberto ao clicar numa foto da prévia (em qualquer modo): só as opções da foto —
 * enquadramento e zoom, corte, giro e espelhamento, borda, cantos, sombra, filtro, link externo, efeito (e a velocidade dele)
 * e excluir. Tudo vale na hora.
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
  speed,
  onSpeed,
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
  /** Velocidade do efeito (1 = normal) */
  speed: number;
  onSpeed: (speed: number | null) => void;
  hidden: boolean;
  onHidden: (hidden: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ImageLook>(look ?? {});
  const [pct, setPct] = useState(Math.round(zoom * 100));
  const [fxSpeed, setFxSpeed] = useState(speed);
  // Giro de 90° em 90° (360° = sem giro)
  const rotate = (deg: 90 | -90) => {
    const r = ((((draft.rot ?? 0) + deg) % 360) + 360) % 360;
    set({ rot: r ? (r as 90 | 180 | 270) : undefined });
  };
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
  // Link: o endereço só vale ao aplicar (digitar não salva meio endereço)
  const [linkText, setLinkText] = useState(look?.href ?? '');
  const [linkError, setLinkError] = useState(false);
  const applyLink = () => {
    const href = normalizeLinkUrl(linkText);
    if (!href) return setLinkError(true);
    setLinkText(href);
    set({ href, nt: draft.href ? draft.nt : true });
  };
  const removeLink = () => {
    setLinkText('');
    set({ href: undefined, nt: undefined, lb: undefined });
  };
  const LINK_KEYS = ['href', 'nt', 'lb'];
  const hasStyle = Object.keys(draft).some((k) => !LINK_KEYS.includes(k));
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
    <div
      ref={drag.ref}
      className="fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl"
      style={{ left: drag.pos.left, top: drag.pos.top, width }}
      role="dialog"
      aria-label="Opções da foto"
    >
      <PopupHeader onGrab={drag.onGrab} onClose={onClose}>
        <p className="text-sm font-semibold">Editando: Foto</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">As mudanças aparecem na hora na prévia</p>
      </PopupHeader>
      <div className="space-y-3">
        <Section title="Zoom e enquadramento">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => zoomTo(pct - (pct <= 100 ? 10 : 20))}
              className="size-8 flex-none rounded-md border border-zinc-200 text-sm hover:border-zinc-400"
              aria-label="Diminuir zoom"
            >
              −
            </button>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              value={pct}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="w-full"
              aria-label="Zoom"
            />
            <button
              type="button"
              onClick={() => zoomTo(pct + (pct < 100 ? 10 : 20))}
              className="size-8 flex-none rounded-md border border-zinc-200 text-sm hover:border-zinc-400"
              aria-label="Aumentar zoom"
            >
              +
            </button>
            <span className="w-11 flex-none text-right text-xs tabular-nums text-zinc-500">{pct}%</span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <button type="button" onClick={onResetFocus} className="whitespace-nowrap text-[11px] text-zinc-500 hover:text-ink">
              ⟲ Restaurar enquadramento
            </button>
            {hasSize ? (
              <button type="button" onClick={onResetSize} className="whitespace-nowrap text-[11px] text-zinc-500 hover:text-ink">
                Tirar corte e tamanho ({deviceLabel.toLowerCase()})
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-zinc-400">Para enquadrar ou cortar, use o modo Fotos: arraste a foto ou as alças azuis das bordas.</p>
        </Section>
        <Section title="Girar e espelhar">
          {/* Cada clique gira 90°; espelhar liga/desliga (fica destacado quando ativo) */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: RotateCcw, label: 'Girar à esquerda', title: 'Girar 90° para a esquerda', onClick: () => rotate(-90), active: false },
              { icon: RotateCw, label: 'Girar à direita', title: 'Girar 90° para a direita', onClick: () => rotate(90), active: false },
              {
                // Nesta versão do lucide o desenho do FlipVertical2 é o espelho lado a lado (e vice-versa)
                icon: FlipVertical2,
                label: 'Espelhar horizontal',
                title: 'Espelhar na horizontal',
                onClick: () => set({ fh: draft.fh ? undefined : true }),
                active: !!draft.fh,
              },
              {
                icon: FlipHorizontal2,
                label: 'Espelhar vertical',
                title: 'Espelhar na vertical',
                onClick: () => set({ fv: draft.fv ? undefined : true }),
                active: !!draft.fv,
              },
            ].map((b) => (
              <button
                key={b.title}
                type="button"
                title={b.title}
                aria-pressed={b.active || undefined}
                onClick={b.onClick}
                className={cn(
                  'flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                  b.active ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50',
                )}
              >
                <b.icon className="size-4 flex-none" />
                {b.label}
              </button>
            ))}
          </div>
          {draft.rot || draft.fh || draft.fv ? (
            <p className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span>
                {[draft.rot ? `Girada ${draft.rot}°` : '', draft.fh ? 'espelhada na horizontal' : '', draft.fv ? 'espelhada na vertical' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <button type="button" onClick={() => set({ rot: undefined, fh: undefined, fv: undefined })} className="text-zinc-500 hover:text-ink">
                Desfazer
              </button>
            </p>
          ) : null}
        </Section>
        <Section title="Borda, cantos, sombra e filtro">
          <Slider label="Espessura da borda" value={draft.bw ?? 0} max={40} onChange={(v) => set({ bw: v || undefined })} />
          {draft.bw ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-600">Cor da borda</span>
              <input
                type="color"
                value={color}
                onChange={(e) => set({ bc: e.target.value.toLowerCase() })}
                className="h-8 w-12 cursor-pointer rounded border border-zinc-200 bg-white p-0.5"
                aria-label="Cor da borda"
              />
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
              <button type="button" onClick={() => set({ r: undefined })} className="mt-1 text-[11px] text-zinc-400 hover:text-ink">
                Voltar aos cantos do modelo
              </button>
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
          {hasStyle ? (
            <button
              type="button"
              onClick={() => {
                // Tira o estilo, mas mantém o link
                const keep = Object.fromEntries(Object.entries(draft).filter(([k]) => LINK_KEYS.includes(k))) as ImageLook;
                setDraft(keep);
                onLook(Object.keys(keep).length ? keep : null);
              }}
              className="text-[11px] text-zinc-500 hover:text-ink"
            >
              Voltar ao estilo do modelo
            </button>
          ) : null}
        </Section>
        <Section title="Link (ao clicar na foto)">
          <div className="flex gap-2">
            <input
              value={linkText}
              onChange={(e) => {
                setLinkText(e.target.value);
                setLinkError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https://… , e-mail ou telefone"
              className={cn(
                'h-8 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none focus:border-zinc-400',
                linkError ? 'border-red-400' : 'border-zinc-200',
              )}
              aria-label="Endereço do link"
            />
            <button type="button" onClick={applyLink} className="whitespace-nowrap rounded-md border border-ink bg-ink px-2 text-xs text-white">
              {draft.href ? 'Atualizar' : 'Aplicar'}
            </button>
          </div>
          {linkError ? <p className="text-[11px] text-red-600">Endereço inválido. Ex.: https://site.com.br</p> : null}
          {draft.href ? (
            <>
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-600">Abrir em</p>
                <Chips
                  items={[
                    { value: true, label: 'Nova aba' },
                    { value: false, label: 'Mesma aba' },
                  ]}
                  value={!!draft.nt}
                  onChange={(v) => set({ nt: v ? true : undefined })}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-zinc-600">Borda indicando o link</p>
                <Chips
                  items={[
                    { value: true, label: 'Com borda' },
                    { value: false, label: 'Sem borda' },
                  ]}
                  value={!!draft.lb}
                  onChange={(v) => set({ lb: v ? true : undefined })}
                />
              </div>
              <button type="button" onClick={removeLink} className="text-[11px] text-zinc-500 hover:text-red-600">
                Remover link
              </button>
            </>
          ) : (
            <p className="text-[11px] text-zinc-400">Na página publicada, clicar na foto abre o link.</p>
          )}
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
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {effect ? (
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-600">
                Velocidade do efeito <span className="font-normal tabular-nums text-zinc-400">{fxSpeed.toFixed(2).replace(/0$/, '')}x</span>
              </span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={fxSpeed}
                onChange={(e) => {
                  const v = Math.max(0.1, Number(e.target.value) || 0.1);
                  setFxSpeed(v);
                  onSpeed(Math.abs(v - 1) < 0.001 ? null : v);
                }}
                className="w-full"
                aria-label="Velocidade do efeito"
              />
              <span className="flex justify-between text-[10px] text-zinc-400">
                <span>Mais lento</span>
                <span>1x</span>
                <span>Mais rápido</span>
              </span>
            </label>
          ) : null}
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
        <Button size="sm" onClick={onClose}>
          Pronto
        </Button>
      </div>
    </div>,
    document.body,
  );
}
