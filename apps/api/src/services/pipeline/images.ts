import type { ScrapedImage } from '../scraper/ScraperService.js';

export interface DraftImage {
  url: string;
  type: string;
  alt_text: string | null;
  source: 'scraped';
  usage_allowed: boolean;
}

// Fotos do próprio negócio (fachada, ambiente, equipe) rendem mais no topo da página
const TYPE_WEIGHT: Record<string, number> = {
  company: 1.4,
  institutional: 1.25,
  service: 1.15,
  gallery: 1.1,
  product: 1.1,
  other: 0.8,
};
const MAX_PHOTOS = 40;

function score(img: ScrapedImage, type: string) {
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  const landscape = w >= h ? 1.15 : 1; // encaixa melhor em hero e galeria
  return w * h * (TYPE_WEIGHT[type] ?? 1) * landscape;
}

/**
 * Monta a lista de imagens do cadastro: logotipo primeiro, depois as fotos
 * ordenadas por qualidade (a primeira vira a foto de destaque da LP).
 * `classified` vem da IA; sem ela, usa as dicas do scraper.
 */
export function assembleImages(opts: {
  scraped: ScrapedImage[];
  classified?: { index: number; type: string; alt_text: string }[] | null;
  logoIndex?: number | null;
  allowUsage: boolean;
  companyName: string;
}): DraftImage[] {
  const { scraped, classified, allowUsage, companyName } = opts;
  const byIndex = new Map(scraped.map((i) => [i.index, i]));
  const out: DraftImage[] = [];
  const used = new Set<number>();

  // Logotipo
  const logoIdx =
    opts.logoIndex != null && byIndex.has(opts.logoIndex)
      ? opts.logoIndex
      : classified?.find((c) => c.type === 'logo')?.index ?? scraped.find((i) => i.logoHint)?.index;
  if (logoIdx != null && byIndex.has(logoIdx)) {
    out.push({ url: byIndex.get(logoIdx)!.url, type: 'logo', alt_text: `Logotipo ${companyName}`, source: 'scraped', usage_allowed: allowUsage });
    used.add(logoIdx);
  }

  // Fotos classificadas pela IA
  const photos: { img: ScrapedImage; type: string; alt: string | null }[] = [];
  for (const c of classified ?? []) {
    const img = byIndex.get(c.index);
    if (!img || used.has(c.index) || c.type === 'logo') continue;
    used.add(c.index);
    photos.push({ img, type: c.type, alt: c.alt_text || img.alt || null });
  }
  // As escolhidas pela IA vêm primeiro (a primeira vira a foto de destaque)
  photos.sort((a, b) => score(b.img, b.type) - score(a.img, a.type));
  // Depois todas as outras fotos encontradas, para o administrador decidir o que usar.
  // A IA só vê endereço e texto alternativo, então não descarta fotos que ela não reconheceu.
  const rest: typeof photos = [];
  for (const img of scraped) {
    if (used.has(img.index) || img.logoHint) continue;
    used.add(img.index);
    rest.push({ img, type: classified ? 'other' : 'gallery', alt: img.alt || null });
  }
  rest.sort((a, b) => score(b.img, b.type) - score(a.img, a.type));
  for (const p of [...photos, ...rest].slice(0, MAX_PHOTOS)) {
    out.push({ url: p.img.url, type: p.type, alt_text: p.alt, source: 'scraped', usage_allowed: allowUsage });
  }
  return out;
}
