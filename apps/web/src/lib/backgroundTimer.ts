/**
 * Timers que continuam com a aba em segundo plano. Nela o navegador atrasa o setTimeout da página
 * (no Chrome, depois de alguns minutos, para uma vez por minuto), o que atrasava o acompanhamento da geração.
 */
let worker: Worker | null | undefined;
let seq = 0;
const callbacks = new Map<number, () => void>();

function getWorker() {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./timerWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<number>) => {
        const fn = callbacks.get(e.data);
        callbacks.delete(e.data);
        fn?.();
      };
      worker.onerror = () => {
        worker = null;
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

/** Igual ao setTimeout, mas sem o atraso da aba em segundo plano. Devolve a função que cancela. */
export function later(fn: () => void, ms: number): () => void {
  const w = getWorker();
  if (!w) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  }
  const id = ++seq;
  callbacks.set(id, fn);
  w.postMessage({ id, ms });
  return () => {
    if (callbacks.delete(id)) w.postMessage({ id });
  };
}
