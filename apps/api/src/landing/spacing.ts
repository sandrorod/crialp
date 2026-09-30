import { MOBILE_MAX } from './elementColors.js';

/**
 * Margem interna (topo/base) das seções em % do padrão do modelo, por layout. Ausente = 100%.
 * `sections`: valor próprio de cada seção (arrastado na prévia), que substitui o geral.
 */
export interface SectionSpacing {
  desktop?: number;
  mobile?: number;
  sections?: { desktop?: Record<string, number>; mobile?: Record<string, number> };
}

export const SPACING_MIN = 20;
export const SPACING_MAX = 100;
/** Limites do ajuste por seção (arrastado na prévia) */
export const SECTION_SPACING_MIN = 0;
export const SECTION_SPACING_MAX = 150;
/** Escala base já aplicada em todos os modelos (ver styles.ts). */
const BASE_SCALE = 0.85;
const SECTION_KEY = /^(hero|about|services|differentials|products|gallery|testimonials|faq|contact|final_cta|footer|custom:[a-z0-9-]{1,40})$/;

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
  return out;
}

const scale = (pct: number) => +((BASE_SCALE * pct) / 100).toFixed(4);

/** Mesmo CSS é gerado na prévia do editor (apps/web/src/components/landing/previewTools.ts). */
export function sectionSpacingCss(s: SectionSpacing): string {
  const layout = (pct: number | undefined, map: Record<string, number> = {}) =>
    (pct ? `:root{--section-y-scale:${scale(pct)}}` : '') +
    Object.entries(map)
      .map(([k, v]) => `[data-section="${k}"]{--section-y-scale:${scale(v)}}`)
      .join('');
  const desktop = layout(s.desktop, s.sections?.desktop);
  const mobile = layout(s.mobile, s.sections?.mobile);
  return [
    desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '',
    mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : '',
  ].join('');
}
