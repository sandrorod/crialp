/**
 * Lote de LPs vindo de "Buscar empresas": as empresas selecionadas são geradas uma de cada vez
 * na tela "Nova Landing Page", que guarda aqui em qual delas está.
 * `ok` = quantas LPs do lote já foram geradas.
 */
export type LpBatch = { items: { url: string; name: string }[]; index: number; fotos: boolean; ok: number };

const KEY = 'lp:batch';

export function loadBatch(): LpBatch | null {
  try {
    const b = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as LpBatch | null;
    return b && b.index < b.items.length ? b : null;
  } catch {
    return null;
  }
}

export function saveBatch(b: LpBatch | null) {
  try {
    if (b) sessionStorage.setItem(KEY, JSON.stringify(b));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: o lote fica só na tela aberta */
  }
}

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
