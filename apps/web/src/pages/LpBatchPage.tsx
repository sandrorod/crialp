import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Check, CircleSlash, Clock, Layers, Loader2, Minus, Pause, Play, Plus, SkipForward, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { later } from '@/lib/backgroundTimer';
import { GAP_MAX, saveGap } from '@/lib/lpBatch';
import { lpBatchService, type LpBatchAction } from '@/services';
import type { LpBatchView } from '@/types';

const POLL = 3000;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Lote de LPs: o servidor analisa e gera uma empresa de cada vez, com o intervalo escolhido entre elas.
 * Esta tela só acompanha e manda os comandos: o lote continua com a aba em segundo plano ou fechada.
 */
export function LpBatchPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<LpBatchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LpBatchAction | null>(null);
  // Diferença entre o relógio do servidor e o deste computador (a contagem segue a hora do servidor)
  const [skew, setSkew] = useState(0);
  const [, setNow] = useState(0);

  const apply = (v: LpBatchView) => {
    setB(v);
    setSkew(new Date(v.now).getTime() - Date.now());
  };

  useEffect(() => {
    if (!id) return;
    let active = true;
    let cancel = () => {};
    const tick = async () => {
      try {
        const v = await lpBatchService.get(id);
        if (!active) return;
        apply(v);
        setError(null);
        if (v.status === 'done' || v.status === 'canceled') return;
      } catch (err) {
        if (!active) return;
        setError(errorMessage(err));
      }
      cancel = later(tick, POLL);
    };
    void tick();
    return () => {
      active = false;
      cancel();
    };
  }, [id]);

  // Contagem do intervalo: redesenha a cada segundo
  const waiting = !!b?.next_at;
  useEffect(() => {
    if (!waiting) return;
    let cancel = () => {};
    const step = () => {
      setNow(Date.now());
      cancel = later(step, 1000);
    };
    step();
    return () => cancel();
  }, [waiting]);

  const act = async (action: LpBatchAction, gap?: number) => {
    if (!id) return;
    setBusy(action);
    try {
      apply(await lpBatchService.action(id, action, gap));
      if (action === 'cancel') toast.info('Lote interrompido. A empresa em andamento termina por conta própria.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!b) {
    return (
      <Card className="mx-auto mt-10 flex max-w-xl items-center gap-3 p-5 text-sm text-zinc-600">
        {error ? <CircleSlash className="size-5 flex-none text-red-600" /> : <Loader2 className="size-5 flex-none animate-spin text-brand-600" />}
        {error ?? 'Carregando o lote…'}
      </Card>
    );
  }

  const finished = b.status === 'done' || b.status === 'canceled';
  const current = b.items[b.index];
  const left = b.next_at ? Math.max(0, Math.ceil((new Date(b.next_at).getTime() - (Date.now() + skew)) / 1000)) : null;
  const pausedLeft = b.status === 'paused' && b.stage === 'wait' ? (b.paused_left ?? 0) : null;
  const inWork = b.stage === 'analyze' || b.stage === 'generate';
  const status = finished
    ? b.status === 'done'
      ? `Lote concluído: ${b.ok} de ${b.items.length} LP(s) gerada(s).`
      : `Lote interrompido: ${b.ok} de ${b.items.length} LP(s) gerada(s).`
    : inWork
      ? b.stage === 'analyze'
        ? 'Lendo o site e interpretando os dados…'
        : 'Gerando a Landing Page…'
      : pausedLeft !== null
        ? `Pausado · próxima empresa em ${mmss(pausedLeft)} ao continuar`
        : left
          ? `Próxima empresa em ${mmss(left)}`
          : 'Começando a próxima empresa…';

  const changeGap = (v: number) => {
    const g = Math.min(GAP_MAX, Math.max(0, v));
    saveGap(g);
    void act('gap', g);
  };

  return (
    <div className="mx-auto max-w-2xl pt-4 lg:pt-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Layers className="size-5 text-brand-600" /> Lote de Landing Pages
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        O servidor gera uma empresa de cada vez. Pode deixar esta aba em segundo plano ou fechar: o lote continua e você acompanha por aqui quando voltar.
      </p>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <strong className="text-sm">{finished ? 'Fim do lote' : `Empresa ${b.index + 1} de ${b.items.length}`}</strong>
          {!finished && current ? <span className="min-w-0 truncate text-sm text-zinc-600">· {current.name || current.url}</span> : null}
        </div>
        <p className={`mt-2 flex items-center gap-2 text-sm ${finished ? 'font-medium text-emerald-700' : 'text-zinc-600'}`}>
          {inWork && !finished ? <Loader2 className="size-4 flex-none animate-spin text-brand-600" /> : null}
          {status}
        </p>
        {b.next_at && b.gap && left !== null ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, 100 - (left / (b.gap * 60)) * 100)}%` }}
            />
          </div>
        ) : null}

        {!finished ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {b.stage === 'wait' ? (
              <Button size="sm" icon={<Play className="size-3.5" />} loading={busy === 'now'} onClick={() => void act('now')}>
                Começar agora
              </Button>
            ) : null}
            {b.stage === 'wait' ? (
              b.status === 'paused' ? (
                <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} loading={busy === 'resume'} onClick={() => void act('resume')}>
                  Continuar contagem
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Pause className="size-3.5" />} loading={busy === 'pause'} onClick={() => void act('pause')}>
                  Pausar
                </Button>
              )
            ) : (
              <Button
                size="sm"
                variant="secondary"
                icon={<SkipForward className="size-3.5" />}
                loading={busy === 'skip'}
                onClick={() => void act('skip')}
                title="Deixa esta empresa sem LP e passa para a próxima"
              >
                Pular
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} loading={busy === 'cancel'} onClick={() => void act('cancel')}>
              Parar lote
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/landing-pages">
              <Button size="sm">Ver Landing Pages</Button>
            </Link>
            <Link to="/buscar">
              <Button size="sm" variant="secondary">
                Voltar para Buscar empresas
              </Button>
            </Link>
          </div>
        )}

        {/* Intervalo entre as LPs: muda a qualquer momento, inclusive durante a espera */}
        {!finished ? (
          <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            <Clock className="size-3.5 flex-none" />
            <span>Intervalo entre as LPs:</span>
            <button
              type="button"
              onClick={() => changeGap(b.gap - 1)}
              disabled={b.gap <= 0 || !!busy}
              className="grid size-7 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40"
              aria-label="Diminuir intervalo"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-14 text-center font-semibold text-ink tabular-nums">{b.gap ? `${b.gap} min` : 'sem pausa'}</span>
            <button
              type="button"
              onClick={() => changeGap(b.gap + 1)}
              disabled={b.gap >= GAP_MAX || !!busy}
              className="grid size-7 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40"
              aria-label="Aumentar intervalo"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4 divide-y divide-zinc-100">
        {b.items.map((item, i) => {
          const r = b.results[i];
          const now = !finished && i === b.index;
          return (
            <div key={`${item.url}-${i}`} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className="mt-0.5 flex-none">
                {r?.status === 'ok' ? (
                  <Check className="size-4 text-emerald-600" />
                ) : r?.status === 'error' ? (
                  <CircleSlash className="size-4 text-red-600" />
                ) : r?.status === 'skipped' ? (
                  <SkipForward className="size-4 text-zinc-400" />
                ) : now && inWork ? (
                  <Loader2 className="size-4 animate-spin text-brand-600" />
                ) : (
                  <span className="block size-4 rounded-full border border-zinc-300" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${now ? 'font-medium text-ink' : 'text-zinc-700'}`}>{item.name || item.url}</span>
                {r?.status === 'error' ? <span className="block text-xs text-red-700">{r.error}</span> : null}
                {r?.status === 'skipped' ? <span className="block text-xs text-zinc-500">Pulada</span> : null}
              </span>
              {r?.landingPageId ? (
                <Link to={`/landing-pages/${r.landingPageId}`} target="_blank" className="flex-none text-xs font-medium text-brand-700 hover:underline">
                  Ver LP
                </Link>
              ) : r?.companyId ? (
                <Link to={`/empresas/${r.companyId}`} target="_blank" className="flex-none text-xs font-medium text-zinc-600 hover:underline">
                  Ver empresa
                </Link>
              ) : null}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
