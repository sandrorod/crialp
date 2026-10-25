import type { ReactNode } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cores claras do CRM: cada aba tem um tom (Empresas azul, WhatsApp verde, Funil violeta, Tarefas âmbar,
 * Conexão céu). O tom aparece no ícone, na faixa do topo de cada quadro e nas etiquetas; o texto continua
 * escuro sobre branco, para a leitura não sofrer.
 */
export type CrmTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose' | 'zinc';

// Classes completas (o Tailwind só gera o que aparece escrito por inteiro)
export const TONES: Record<CrmTone, { tile: string; solid: string; bar: string; pill: string; active: string; text: string }> = {
  blue: {
    tile: 'bg-blue-100 text-blue-600',
    solid: 'bg-blue-500 text-white',
    bar: 'border-blue-100 bg-linear-to-r from-blue-50 via-blue-50/40 to-white',
    pill: 'bg-blue-50 text-blue-700 ring-blue-100',
    active: 'bg-blue-50 text-blue-800',
    text: 'text-blue-700',
  },
  emerald: {
    tile: 'bg-emerald-100 text-emerald-600',
    solid: 'bg-emerald-500 text-white',
    bar: 'border-emerald-100 bg-linear-to-r from-emerald-50 via-emerald-50/40 to-white',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    active: 'bg-emerald-50 text-emerald-800',
    text: 'text-emerald-700',
  },
  violet: {
    tile: 'bg-violet-100 text-violet-600',
    solid: 'bg-violet-500 text-white',
    bar: 'border-violet-100 bg-linear-to-r from-violet-50 via-violet-50/40 to-white',
    pill: 'bg-violet-50 text-violet-700 ring-violet-100',
    active: 'bg-violet-50 text-violet-800',
    text: 'text-violet-700',
  },
  amber: {
    tile: 'bg-amber-100 text-amber-600',
    solid: 'bg-amber-500 text-white',
    bar: 'border-amber-100 bg-linear-to-r from-amber-50 via-amber-50/40 to-white',
    pill: 'bg-amber-50 text-amber-800 ring-amber-100',
    active: 'bg-amber-50 text-amber-900',
    text: 'text-amber-700',
  },
  sky: {
    tile: 'bg-sky-100 text-sky-600',
    solid: 'bg-sky-500 text-white',
    bar: 'border-sky-100 bg-linear-to-r from-sky-50 via-sky-50/40 to-white',
    pill: 'bg-sky-50 text-sky-700 ring-sky-100',
    active: 'bg-sky-50 text-sky-800',
    text: 'text-sky-700',
  },
  rose: {
    tile: 'bg-rose-100 text-rose-600',
    solid: 'bg-rose-500 text-white',
    bar: 'border-rose-100 bg-linear-to-r from-rose-50 via-rose-50/40 to-white',
    pill: 'bg-rose-50 text-rose-700 ring-rose-100',
    active: 'bg-rose-50 text-rose-800',
    text: 'text-rose-700',
  },
  zinc: {
    tile: 'bg-zinc-100 text-zinc-500',
    solid: 'bg-zinc-500 text-white',
    bar: 'border-zinc-100 bg-linear-to-r from-zinc-50 to-white',
    pill: 'bg-zinc-100 text-zinc-600 ring-zinc-200/70',
    active: 'bg-zinc-100 text-ink',
    text: 'text-zinc-600',
  },
};

/** Ícone num quadradinho colorido. */
export function ToneIcon({ tone, children, className }: { tone: CrmTone; children: ReactNode; className?: string }) {
  return <span className={cn('grid size-8 flex-none place-items-center rounded-lg', TONES[tone].tile, className)}>{children}</span>;
}

/** Faixa do topo de um quadro: ícone + título (opcional) e os filtros/ações ao lado. */
export function CrmBar({
  tone,
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  tone: CrmTone;
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3', TONES[tone].bar, className)}>
      {icon ? <ToneIcon tone={tone}>{icon}</ToneIcon> : null}
      {title ? (
        // Sem filtros ao lado, o título ocupa a linha (o subtítulo quebra em vez de jogar o título para baixo do ícone)
        <div className={cn('min-w-0', children ? 'max-w-full' : 'flex-1')}>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Etiqueta clara (contadores, status, prazos). */
export function Pill({ tone, children, className, title }: { tone: CrmTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone].pill, className)}
    >
      {children}
    </span>
  );
}

const AVATAR_TONES = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

/** Iniciais num círculo; a cor sai do nome, então a mesma pessoa/empresa tem sempre a mesma cor. */
export function Avatar({ name, size = 'md', className }: { name: string | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  // NFKC: letras estilizadas do WhatsApp (𝐇𝐞𝐫𝐦𝐚𝐧𝐨) viram letras comuns; só letras entram nas iniciais
  const clean = (name ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? Array.from(w)[0] : '');
  const initials = (
    words.length > 1
      ? first(words[0]) + first(words[words.length - 1])
      : Array.from(words[0] ?? '')
          .slice(0, 2)
          .join('')
  ).toUpperCase();
  let hash = 0;
  for (const ch of name ?? '') hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (
    <span
      aria-hidden
      className={cn(
        'grid flex-none place-items-center rounded-full font-semibold',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-12 text-base',
        AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length],
        className,
      )}
    >
      {initials || <User className={size === 'lg' ? 'size-5' : 'size-4'} />}
    </span>
  );
}
