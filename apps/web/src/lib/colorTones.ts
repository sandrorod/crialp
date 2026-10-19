/**
 * Tons das duas cores da página (principal e destaque) para as amostras de cor do editor:
 * do mais claro (bom para fundo) à cor pura e ao mais escuro (bom para texto e faixas).
 */
const HEX = /^#[0-9a-f]{6}$/i;

function mix(a: string, b: string, amount: number) {
  const A = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const B = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${A.map((c, i) => Math.round(c + (B[i] - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** Clareado (misturado ao branco) → cor pura → escurecido (misturado ao preto). */
export function tonesOf(color: string): string[] {
  const c = color.toLowerCase();
  if (!HEX.test(c)) return [];
  return [
    mix(c, '#ffffff', 0.92),
    mix(c, '#ffffff', 0.8),
    mix(c, '#ffffff', 0.55),
    mix(c, '#ffffff', 0.3),
    c,
    mix(c, '#000000', 0.25),
    mix(c, '#000000', 0.5),
    mix(c, '#000000', 0.72),
  ];
}

export interface ToneRow {
  label: string;
  colors: string[];
}

/** Linhas de amostras: principal e destaque (sem repetir quando as duas cores são iguais). */
export function brandTones(primary: string | null | undefined, accent: string | null | undefined): ToneRow[] {
  const rows: ToneRow[] = [];
  if (primary && HEX.test(primary)) rows.push({ label: 'Principal', colors: tonesOf(primary) });
  if (accent && HEX.test(accent) && accent.toLowerCase() !== primary?.toLowerCase()) rows.push({ label: 'Destaque', colors: tonesOf(accent) });
  return rows;
}

/** Cores da página carregada na prévia (variáveis --primary e --accent do :root). */
export function readBrandColors(doc: Document | null): { primary: string | null; accent: string | null } {
  if (!doc?.documentElement || !doc.defaultView) return { primary: null, accent: null };
  const style = doc.defaultView.getComputedStyle(doc.documentElement);
  const read = (name: string) => {
    const v = style.getPropertyValue(name).trim().toLowerCase();
    return HEX.test(v) ? v : null;
  };
  return { primary: read('--primary'), accent: read('--accent') };
}
