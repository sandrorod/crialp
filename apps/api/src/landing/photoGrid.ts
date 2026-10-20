/**
 * "Fotos por linha" (N) escolhido no editor: linhas justificadas com exatamente N fotos cada. As fotos de cada
 * linha ficam com a mesma altura e larguras proporcionais ao formato de cada uma (proporção lida no navegador,
 * ver REVEAL_SCRIPT). A última linha, se incompleta, mantém o tamanho das outras e fica centralizada.
 */
export function photoRows<T>(items: T[], cols: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
  return out;
}
