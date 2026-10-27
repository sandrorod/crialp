/**
 * Timers que continuam com a aba em segundo plano. Nela o navegador atrasa o setTimeout da página
 * (no Chrome, depois de alguns minutos, para uma vez por minuto) e pode até congelar a aba, o que
 * parava o lote de LPs e o acompanhamento da geração.
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

/** Segundos que passaram de fato desde `since` (pelo menos 1), para contagens não ficarem para trás. */
export const elapsedSeconds = (since: number) => Math.max(1, Math.round((Date.now() - since) / 1000));

/**
 * Enquanto ativo, impede o Chrome de congelar a aba em segundo plano (aba com Web Lock não é congelada).
 * Devolve a função que libera.
 */
export function keepAwake(name = 'lp:keep-awake'): () => void {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  try {
    void navigator.locks?.request(name, { mode: 'shared' }, () => held).catch(() => {});
  } catch {
    /* navegador sem Web Locks */
  }
  return release;
}
