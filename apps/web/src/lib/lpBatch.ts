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
