/// <reference lib="webworker" />
// Timers fora da página: o navegador não reduz os do Worker quando a aba vai para segundo plano
const timers = new Map<number, ReturnType<typeof setTimeout>>();

self.onmessage = (e: MessageEvent<{ id: number; ms?: number }>) => {
  const { id, ms } = e.data;
  if (ms === undefined) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    return;
  }
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      self.postMessage(id);
    }, ms),
  );
};
