/**
 * Com "Fotos por linha" (N) escolhido no editor: as fotos da última linha incompleta recebem "gl-rR"
 * (R = quantas sobraram) e dividem a linha inteira entre si, sem deixar buraco (CSS em styles.ts).
 */
export function lastRowClass(index: number, count: number, cols: number | null | undefined): string {
  if (!cols || cols < 2) return '';
  const rest = count % cols;
  return rest && index >= count - rest ? ` gl-r${rest}` : '';
}
