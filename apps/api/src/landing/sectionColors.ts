import { contrast, ensureContrast, isHex, mix, type ResolvedTheme } from './theme.js';

/** Cores escolhidas para uma seção específica (sobrepõem as cores do projeto). */
export interface SectionColors {
  bg?: string | null;
  text?: string | null;
  accent?: string | null;
}

const hex = (v: unknown) => (isHex(v) ? (String(v).startsWith('#') ? String(v) : `#${v}`).toLowerCase() : null);

export function normalizeSectionColors(input: unknown): Record<string, SectionColors> {
  const out: Record<string, SectionColors> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, SectionColors>)) {
    if (!/^(hero|header|footer|about|services|differentials|products|gallery|testimonials|faq|contact|final_cta|custom:[a-z0-9-]{1,40})$/.test(key)) continue;
    const c = { bg: hex(value?.bg), text: hex(value?.text), accent: hex(value?.accent) };
    if (c.bg || c.text || c.accent) out[key] = c;
  }
  return out;
}

/** Texto legível sobre o fundo: a cor de texto do projeto se tiver contraste, senão branco ou quase preto. */
function bestText(bg: string, preferred: string) {
  if (contrast(preferred, bg) >= 4.5) return preferred;
  return contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111';
}

/**
 * Variáveis CSS de uma seção com cores próprias. Como todo o CSS da página usa
 * variáveis, redefini-las no contêiner da seção recolore cards, botões, bordas e
 * destaques internos mantendo o contraste (WCAG).
 */
export function sectionVars(theme: ResolvedTheme, colors: SectionColors | undefined): Record<string, string> | null {
  if (!colors || !(colors.bg || colors.text || colors.accent)) return null;
  const v = theme.vars;
  const bg = colors.bg ?? v['--bg'];
  const text = colors.text ? ensureContrast(colors.text, bg, 4.5) : colors.bg ? bestText(bg, v['--text']) : v['--text'];
  const accent = colors.accent ?? v['--primary'];
  const accentInk = ensureContrast(accent, bg, 4.5);
  const muted = ensureContrast(mix(text, bg, 0.3), bg, 4.5);
  const border = mix(bg, text, 0.14);
  const onAccent = contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#ffffff' : '#111111';

  return {
    background: bg,
    color: text,
    '--bg': bg,
    '--surface': bg, // faixas alternadas assumem a cor escolhida
    '--text': text,
    '--muted': muted,
    '--border': border,
    '--primary': accent,
    '--on-primary': onAccent,
    '--primary-ink': accentInk,
    '--primary-soft': mix(bg, accent, 0.12),
    '--accent-ink': accentInk,
    // Seções em faixa (diferenciais) e o painel do topo usam as variáveis --band
    '--band': bg,
    '--band-text': text,
    '--band-muted': muted,
    '--band-accent': accentInk,
    '--band-border': border,
  };
}

/** CTA final: fundo = cor de destaque; botão invertido. */
export function finalCtaVars(theme: ResolvedTheme, colors: SectionColors | undefined): Record<string, string> | null {
  if (!colors || !(colors.bg || colors.text || colors.accent)) return null;
  const bg = colors.bg ?? colors.accent ?? theme.vars['--primary'];
  const text = colors.text ? ensureContrast(colors.text, bg, 4.5) : bestText(bg, '#ffffff');
  return { background: bg, color: text, '--primary': bg, '--on-primary': text };
}
