import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PIPELINE_STEPS = [
  'Acessando site',
  'Analisando conteúdo',
  'Identificando empresa',
  'Extraindo contatos',
  'Identificando serviços',
  'Identificando informações comerciais',
  'Gerando estrutura da Landing Page',
  'Gerando Landing Page',
  'Salvando informações',
];

/**
 * Linha do tempo do processamento. `current` é a etapa em andamento (1–9);
 * etapas anteriores aparecem concluídas. `range` limita quais etapas exibir.
 */
export function ProgressSteps({ current, range = [1, 9], failed, done }: { current: number; range?: [number, number]; failed?: boolean; done?: boolean }) {
  const steps = PIPELINE_STEPS.map((label, i) => ({ n: i + 1, label })).filter((s) => s.n >= range[0] && s.n <= range[1]);
  const total = steps.length;
  const completed = done ? total : steps.filter((s) => s.n < current).length;
  const pct = Math.round((completed / total) * 100);

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{done ? 'Concluído' : failed ? 'Interrompido' : 'Processando…'}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className={cn('h-full rounded-full transition-all duration-700 ease-out', failed ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      </div>
      <ol className="space-y-1">
        {steps.map((s) => {
          const state = done || s.n < current ? 'done' : s.n === current ? (failed ? 'failed' : 'active') : 'pending';
          return (
            <li key={s.n} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors', state === 'active' && 'bg-brand-50')}>
              <span
                className={cn(
                  'grid size-6 flex-none place-items-center rounded-full text-[11px] font-semibold transition-all',
                  state === 'done' && 'bg-emerald-500 text-white',
                  state === 'active' && 'pulse-ring bg-brand-600 text-white',
                  state === 'failed' && 'bg-red-500 text-white',
                  state === 'pending' && 'bg-zinc-100 text-zinc-400',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'failed' ? <X className="size-3.5" strokeWidth={3} /> : s.n}
              </span>
              <span className={cn('text-sm', state === 'pending' ? 'text-zinc-400' : 'text-ink', state === 'active' && 'font-medium')}>{s.label}</span>
              {state === 'active' ? <span className="ml-auto text-xs text-brand-600">em andamento</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
