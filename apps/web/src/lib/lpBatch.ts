/** Lote de LPs (gerado no servidor): preferências lembradas neste navegador. */

/** Intervalo entre uma LP e a próxima do lote, em minutos (lembrado neste navegador). */
const GAP_KEY = 'lp:batch-gap';
export const GAP_DEFAULT = 3;
export const GAP_MAX = 60;

export function loadGap(): number {
  try {
    const n = Number(localStorage.getItem(GAP_KEY));
    return localStorage.getItem(GAP_KEY) !== null && Number.isFinite(n) ? Math.min(GAP_MAX, Math.max(0, Math.round(n))) : GAP_DEFAULT;
  } catch {
    return GAP_DEFAULT;
  }
}

export function saveGap(minutes: number) {
  try {
    localStorage.setItem(GAP_KEY, String(minutes));
  } catch {
    /* sem armazenamento: vale só nesta tela */
  }
}
