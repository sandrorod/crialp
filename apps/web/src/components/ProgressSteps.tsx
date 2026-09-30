import { useEffect, useState } from 'react';
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
 * Duração típica de cada etapa, em segundos. O servidor só informa a etapa atual,
 * então a barra da etapa em andamento avança por estimativa e completa quando ela termina.
 */
const STEP_SECONDS = [10, 1.5, 40, 1.5, 1.5, 2, 2, 60, 3];

/** Progresso estimado (0–95%) da etapa em andamento; desacelera sem nunca chegar a 100%. */
function useActiveStepPct(current: number, running: boolean) {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setStartedAt(Date.now());
    setNow(Date.now());
  }, [current]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const expected = STEP_SECONDS[current - 1] ?? 5;
  const elapsed = (now - startedAt) / 1000;
  return Math.round(95 * (1 - Math.exp(-elapsed / (expected * 0.6))));
}

/**
 * Linha do tempo do processamento. `current` é a etapa em andamento (1–9);
 * etapas anteriores aparecem concluídas. `range` limita quais etapas exibir.
 */
export function ProgressSteps({ current, range = [1, 9], failed, done }: { current: number; range?: [number, number]; failed?: boolean; done?: boolean }) {
  const steps = PIPELINE_STEPS.map((label, i) => ({ n: i + 1, label })).filter((s) => s.n >= range[0] && s.n <= range[1]);
  const total = steps.length;
  const completed = done ? total : steps.filter((s) => s.n < current).length;
  const activePct = useActiveStepPct(current, !done && !failed);
  const activeInRange = !done && current >= range[0] && current <= range[1];
  const pct = Math.round(((completed + (activeInRange && !failed ? activePct / 100 : 0)) / total) * 100);

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
          const stepPct = state === 'done' ? 100 : state === 'active' || state === 'failed' ? activePct : 0;
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm', state === 'pending' ? 'text-zinc-400' : 'text-ink', state === 'active' && 'font-medium')}>{s.label}</span>
                  <span
                    className={cn(
                      'ml-auto text-xs tabular-nums',
                      state === 'done' && 'text-emerald-600',
                      state === 'active' && 'text-brand-600',
                      state === 'failed' && 'text-red-600',
                      state === 'pending' && 'text-zinc-400',
                    )}
                  >
                    {state === 'failed' ? 'falhou' : `${stepPct}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300 ease-out',
                      state === 'done' && 'bg-emerald-500',
                      state === 'active' && 'bg-brand-500',
                      state === 'failed' && 'bg-red-500',
                    )}
                    style={{ width: `${stepPct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
