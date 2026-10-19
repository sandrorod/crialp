/**
 * "Fotos por linha" (N) escolhido no editor: linhas justificadas. As fotos de cada linha ficam com a mesma
 * altura e larguras proporcionais ao formato de cada uma (proporção lida no navegador, ver REVEAL_SCRIPT),
 * preenchendo a linha inteira. As linhas são equilibradas: 9 fotos com até 4 por linha = 3 + 3 + 3.
 */
export function balancedRows<T>(items: T[], cols: number): T[][] {
  if (items.length === 0) return [];
  const rows = Math.ceil(items.length / cols);
  const base = Math.floor(items.length / rows);
  const extra = items.length % rows; // as primeiras linhas recebem uma foto a mais
  const out: T[][] = [];
  let at = 0;
  for (let r = 0; r < rows; r++) {
    const size = base + (r < extra ? 1 : 0);
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}
