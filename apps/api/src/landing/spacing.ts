import { MOBILE_MAX } from './elementColors.js';

/**
 * Margem interna (topo/base) das seções em % do padrão do modelo, por layout. Ausente = 100%.
 * `sections`: valor próprio de cada seção (arrastado na prévia), que substitui o geral.
 */
export interface SectionSpacing {
  desktop?: number;
  mobile?: number;
  sections?: { desktop?: Record<string, number>; mobile?: Record<string, number> };
  /** Largura dos títulos / dos textos em % (40–100), por layout. Ausente = largura do modelo. */
  titleWidth?: { desktop?: number; mobile?: number };
  textWidth?: { desktop?: number; mobile?: number };
}

export const SPACING_MIN = 20;
export const SPACING_MAX = 100;
/** Limites do ajuste por seção (arrastado na prévia) */
export const SECTION_SPACING_MIN = 0;
export const SECTION_SPACING_MAX = 150;
/** Escala base já aplicada em todos os modelos (ver styles.ts). */
const BASE_SCALE = 0.85;
const SECTION_KEY = /^(hero|about|services|differentials|products|gallery|testimonials|reviews|faq|contact|final_cta|footer|custom:[a-z0-9-]{1,40})$/;

function clampPct(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(Math.min(SPACING_MAX, Math.max(SPACING_MIN, v)));
  return n === SPACING_MAX ? undefined : n;
}

function normalizeSectionMap(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (!SECTION_KEY.test(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = Math.round(Math.min(SECTION_SPACING_MAX, Math.max(SECTION_SPACING_MIN, v)));
  }
  return out;
}

export function normalizeSectionSpacing(input: any): SectionSpacing {
  const out: SectionSpacing = {};
  const d = clampPct(input?.desktop);
  const m = clampPct(input?.mobile);
  if (d !== undefined) out.desktop = d;
  if (m !== undefined) out.mobile = m;
  const sd = normalizeSectionMap(input?.sections?.desktop);
  const sm = normalizeSectionMap(input?.sections?.mobile);
  if (Object.keys(sd).length || Object.keys(sm).length) out.sections = { desktop: sd, mobile: sm };
  for (const k of ['titleWidth', 'textWidth'] as const) {
    const w = normalizeWidth(input?.[k]);
    if (w) out[k] = w;
  }
  return out;
}

function normalizeWidth(input: any): { desktop?: number; mobile?: number } | undefined {
  const pick = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && v < 100 ? Math.round(Math.max(TEXT_WIDTH_MIN, v)) : undefined;
  const d = pick(input?.desktop);
  const m = pick(input?.mobile);
  return d || m ? { ...(d ? { desktop: d } : {}), ...(m ? { mobile: m } : {}) } : undefined;
}

/** Largura de títulos e textos (% da área de cada um): faixa mais estreita, mesma letra. */
export const TEXT_WIDTH_MIN = 40;
const TITLE_SEL = '.hero h1,.section-head h2,.final h2,.custom-text h3,.blk-heading h3';
const TEXT_SEL = '.hero .sub,.hero p,.section-head .lead,.about-text p,.custom-text p,.blk-text p,.final p';
// Onde o modelo centraliza o texto, a faixa mais estreita continua no meio
const CENTERED_SEL = [
  '.hero-centered', '.section-head.center', '.final', '.custom-center', '.tpl-elegante .hero-split .container',
  ...['aurora', 'elegante', 'moderno', 'organico'].map((t) => `.tpl-${t} .section>.container>.section-head`),
].map((c) => `${c} :is(h1,h2,h3,p,.lead,.sub)`).join(',');
function textWidthRules(title: number | undefined, text: number | undefined) {
  if (!title && !text) return '';
  return (
    (title ? `:is(${TITLE_SEL}){max-width:${title}%!important}` : '') +
    (text ? `:is(${TEXT_SEL}){max-width:${text}%!important}` : '') +
    `:is(${CENTERED_SEL}){margin-left:auto;margin-right:auto}`
  );
}


const scale = (pct: number) => +((BASE_SCALE * pct) / 100).toFixed(4);

/** Mesmo CSS é gerado na prévia do editor (apps/web/src/components/landing/previewTools.ts). */
export function sectionSpacingCss(s: SectionSpacing): string {
  const layout = (pct: number | undefined, map: Record<string, number> = {}) =>
    (pct ? `:root{--section-y-scale:${scale(pct)}}` : '') +
    Object.entries(map)
      .map(([k, v]) => `[data-section="${k}"]{--section-y-scale:${scale(v)}}`)
      .join('');
  const desktop = layout(s.desktop, s.sections?.desktop) + textWidthRules(s.titleWidth?.desktop, s.textWidth?.desktop);
  const mobile = layout(s.mobile, s.sections?.mobile) + textWidthRules(s.titleWidth?.mobile, s.textWidth?.mobile);
  return [
    desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '',
    mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : '',
  ].join('');
}
