/** Cores em hexadecimal: validação, mistura e contraste (WCAG). */
const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

function toRgb(hex: string): [number, number, number] {
  const h = HEX_RE.exec(hex.trim())![1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: number[]) {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
export function mix(a: string, b: string, amount: number) {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex(A.map((c, i) => c + (B[i] - c) * amount));
}
export function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Escurece/clareia a cor até atingir o contraste mínimo sobre o fundo. */
export function ensureContrast(color: string, bg: string, min: number) {
  if (contrast(color, bg) >= min) return color;
  const target = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(color, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}
export function readableOn(bg: string) {
  return contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111';
}
