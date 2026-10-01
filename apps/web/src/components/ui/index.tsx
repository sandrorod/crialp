import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LpStatus } from '@/types';

// ─── Botão ──────────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-zinc-800 shadow-sm',
  brand: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-ink border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 shadow-xs',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Campos ─────────────────────────────────────────────────────────
const fieldBase =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-ink placeholder:text-zinc-400 transition focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100 disabled:bg-zinc-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'py-2.5 min-h-[88px] leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

/** Campo de texto que trata null como vazio. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  multiline,
  className,
  ...props
}: { label: string; value: string | null | undefined; onChange: (v: string | null) => void; hint?: ReactNode; multiline?: boolean; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Field label={label} hint={hint} className={className}>
      {multiline ? (
        <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder={props.placeholder} />
      ) : (
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...props} />
      )}
    </Field>
  );
}

// ─── Lista de textos editável ───────────────────────────────────────
export function ListEditor({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">{label}</span>
      {values.length ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <li key={`${v}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-zinc-100 py-1 pl-2.5 pr-1 text-[13px] text-zinc-700">
              <span className="truncate">{v}</span>
              <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700" aria-label={`Remover ${v}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? 'Adicionar e pressionar Enter'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} icon={<Plus className="size-4" />} aria-label="Adicionar" />
      </div>
    </div>
  );
}

// ─── Estrutura ──────────────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]', className)}>{children}</div>;
}

export function CardSection({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-zinc-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-zinc-100 text-zinc-500">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-zinc-400', className)} />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 rounded-lg" />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

// ─── Status ─────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: LpStatus | null }) {
  if (!status) return <span className="text-xs text-zinc-400">Sem LP</span>;
  return status === 'ativa' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15">
      <span className="size-1.5 rounded-full bg-emerald-500" /> Ativa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/15">
      <span className="size-1.5 rounded-full bg-red-500" /> Inativa
    </span>
  );
}

/** Botão visual de ativar/desativar: 🟢 Ativa / 🔴 Inativa */
export function StatusToggle({ status, onToggle, loading }: { status: LpStatus; onToggle: () => void; loading?: boolean }) {
  const active = status === 'ativa';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Ativa — clique para desativar' : 'Inativa — clique para ativar'}
      title={active ? 'Ativa — clique para desativar' : 'Inativa — clique para ativar'}
      className="inline-flex rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
    >
      <span className={cn('relative h-6 w-10 rounded-full transition', active ? 'bg-emerald-500' : 'bg-red-400')}>
        <span className={cn('absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-all', active ? 'left-[18px]' : 'left-0.5')}>
          {loading ? <Loader2 className="size-3 animate-spin text-zinc-400" /> : null}
        </span>
      </span>
    </button>
  );
}

// ─── Diálogo de confirmação ─────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={(e) => e.target === e.currentTarget && onClose()} // ignora o "close" repassado por diálogos aninhados
      onClick={(e) => e.target === ref.current && !loading && onClose()}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-2xl p-0 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-zinc-600">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────
export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  busy,
  size = 'md',
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={(e) => e.target === e.currentTarget && onClose()} // ignora o "close" repassado por diálogos aninhados
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      className={cn(
        'm-auto w-[calc(100%-32px)] rounded-2xl p-0 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]',
        size === 'lg' ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-48px)] flex-col">
          <div className="border-b border-zinc-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description ? <div className="mt-0.5 text-sm text-zinc-500">{description}</div> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

// ─── Paginação ──────────────────────────────────────────────────────
/** Rodapé de lista: "1–10 de 37" e navegação entre páginas. Some quando cabe tudo em uma página. */
export function Pagination({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  // Primeira, última e vizinhas da atual; o resto vira "…"
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm transition disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3 text-sm text-zinc-500">
      <span>
        {from}–{to} de {total}
      </span>
      <nav className="flex items-center gap-1" aria-label="Paginação">
        <button type="button" className={cn(btn, 'hover:bg-zinc-100 hover:text-ink')} disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="size-4" />
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 ? <span className="px-1">…</span> : null}
            <button
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              className={cn(btn, n === page ? 'bg-ink font-medium text-white' : 'hover:bg-zinc-100 hover:text-ink')}
            >
              {n}
            </button>
          </span>
        ))}
        <button type="button" className={cn(btn, 'hover:bg-zinc-100 hover:text-ink')} disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">
          <ChevronRight className="size-4" />
        </button>
      </nav>
    </div>
  );
}
