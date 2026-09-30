import { MOBILE_MAX } from './elementColors.js';

/** Margem interna (topo/base) das seções em % do padrão do modelo, por layout. Ausente = 100%. */
export interface SectionSpacing {
  desktop?: number;
  mobile?: number;
}

export const SPACING_MIN = 20;
export const SPACING_MAX = 100;
/** Escala base já aplicada em todos os modelos (ver styles.ts). */
const BASE_SCALE = 0.85;

function clampPct(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(Math.min(SPACING_MAX, Math.max(SPACING_MIN, v)));
  return n === SPACING_MAX ? undefined : n;
}

export function normalizeSectionSpacing(input: any): SectionSpacing {
  const out: SectionSpacing = {};
  const d = clampPct(input?.desktop);
  const m = clampPct(input?.mobile);
  if (d !== undefined) out.desktop = d;
  if (m !== undefined) out.mobile = m;
  return out;
}

/** Mesmo CSS é gerado na prévia do editor (apps/web/src/components/landing/previewTools.ts). */
export function sectionSpacingCss(s: SectionSpacing): string {
  const rule = (pct?: number) => (pct ? `:root{--section-y-scale:${+((BASE_SCALE * pct) / 100).toFixed(4)}}` : '');
  const desktop = rule(s.desktop);
  const mobile = rule(s.mobile);
  return [
    desktop ? `@media(min-width:${MOBILE_MAX + 1}px){${desktop}}` : '',
    mobile ? `@media(max-width:${MOBILE_MAX}px){${mobile}}` : '',
  ].join('');
}
