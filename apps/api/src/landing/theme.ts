import { DESIGN_PRESETS, type DesignPreset } from '../services/ai/schemas.js';
import { normalizeSectionColors, type SectionColors } from './sectionColors.js';
import { normalizeElementColors, type ElementColors } from './elementColors.js';
import { normalizeSectionSpacing, type SectionSpacing } from './spacing.js';
import { normalizeImageSizes, type ImageSizes } from './imageSize.js';

export interface ThemeSettings {
  preset: DesignPreset;
  primary?: string | null;
  accent?: string | null;
  /** Topo: foto emoldurada ao lado do texto ("split") ou mensagem centralizada. */
  heroVariant?: 'split' | 'centered';
  /** Cores próprias por seção (hero, about, services…, custom:<id>, footer). */
  sections?: Record<string, SectionColors>;
  /** Local escolhido para cada foto (chave = URL). Sem entrada = automático. */
  images?: Record<string, ImagePlacement>;
  /** Modelo de layout (estrutura da página); cores e fontes continuam vindo do preset. */
  template?: TemplateKey;
  /** Ponto de corte (0–100%) das fotos do topo e de "sobre", por URL. Ausente = centro. */
  focus?: Record<string, ImageFocus>;
  /** Ordem das fotos (URLs) escolhida no editor; fotos fora da lista vêm depois, na ordem da empresa. */
  imageOrder?: string[];
  /** Ordem das seções só no celular (arrastada na prévia). Vazia = mesma ordem do computador. */
  mobileOrder?: string[];
  /** Cores de elementos escolhidas clicando na prévia, por layout (celular / computador). */
  elementColors?: ElementColors;
  /** Margem interna (topo/base) das seções em % do padrão, por layout (celular / computador). */
  sectionSpacing?: SectionSpacing;
  /** Largura (%) e altura (px) das fotos arrastadas na prévia, por layout (celular / computador). */
  imageSize?: ImageSizes;
  /** Onde o logotipo aparece: cabeçalho (padrão), início do conteúdo (acima do título) ou seção "Sobre". */
  logoPlacement?: LogoPlacement;
  /** Tira os emojis de todos os textos da página. */
  removeEmojis?: boolean;
  /** Cabeçalho: logotipo (padrão), nome da empresa ou os dois. */
  brand?: BrandDisplay;
}

export type BrandDisplay = 'logo' | 'name' | 'both';

export type LogoPlacement = 'header' | 'hero' | 'about';

export interface ImageFocus {
  x: number;
  y: number;
  /** Zoom (1 = sem zoom, até 3) aplicado a partir do ponto de corte */
  z?: number;
}

function normalizeFocus(input: unknown): Record<string, ImageFocus> {
  const out: Record<string, ImageFocus> = {};
  if (!input || typeof input !== 'object') return out;
  const pct = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v)) * 10) / 10 : 50);
  for (const [url, f] of Object.entries(input).slice(0, 300)) {
    if (url.length > 2048 || !f || typeof f !== 'object') continue;
    const z = (f as ImageFocus).z;
    const zoom = typeof z === 'number' && Number.isFinite(z) ? Math.round(Math.min(3, Math.max(1, z)) * 100) / 100 : 1;
    out[url] = { x: pct((f as ImageFocus).x), y: pct((f as ImageFocus).y), ...(zoom > 1 ? { z: zoom } : {}) };
  }
  return out;
}

export const TEMPLATE_KEYS = [
  'classico', 'moderno', 'minimalista', 'elegante', 'impacto', 'revista', 'blocos', 'noturno', 'capa', 'organico',
  'aurora', 'linhas', 'suave', 'estudio', 'degrade',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

interface Template {
  label: string;
  description: string;
  /** Topo recomendado: com foto liberada usa a primeira opção; sem foto, a segunda. */
  hero: { withPhoto: 'split' | 'centered'; withoutPhoto: 'split' | 'centered' };
  /** Layout dos serviços conforme a quantidade de itens (null = o do preset). */
  services: (count: number) => 'grid' | 'list' | null;
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  classico: {
    label: 'Clássico',
    description: 'Equilibrado e versátil: texto à esquerda e foto à direita no topo, serviços em cartões, galeria em mosaico.',
    hero: { withPhoto: 'split', withoutPhoto: 'split' },
    services: () => null,
  },
  moderno: {
    label: 'Moderno',
    description: 'Foto antes do texto, fotos quadradas bem arredondadas, títulos e cartões centralizados, galeria em 3 colunas.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    // Poucos serviços ficam melhores em lista; a partir de 3, cartões
    services: (n) => (n <= 2 ? 'list' : 'grid'),
  },
  minimalista: {
    label: 'Minimalista',
    description: 'Coluna única: foto larga abaixo do título, "Sobre" em duas colunas, serviços em lista e galeria em 2 colunas.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'list',
  },
  elegante: {
    label: 'Elegante',
    description: 'Topo centralizado com foto emoldurada embaixo, foto em retrato no "Sobre", galeria emoldurada.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    // Listas longas viram cartões para não alongar demais a página
    services: (n) => (n <= 6 ? 'list' : 'grid'),
  },
  impacto: {
    label: 'Impacto',
    description: 'Topo ocupando a tela, títulos enormes, fotos com bloco de cor, serviços numerados e galeria com foto em destaque.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: (n) => (n === 1 ? 'list' : 'grid'),
  },
  revista: {
    label: 'Revista',
    description: 'Editorial: fios pretos separando as seções, letra capitular no "Sobre", serviços em colunas e galeria em mosaico com as fotos inteiras.',
    hero: { withPhoto: 'split', withoutPhoto: 'split' },
    services: (n) => (n <= 3 ? 'list' : 'grid'),
  },
  blocos: {
    label: 'Blocos',
    description: 'Cada seção num painel arredondado, cartões de tamanhos variados (o primeiro em destaque) e galeria em grade irregular.',
    hero: { withPhoto: 'split', withoutPhoto: 'split' },
    services: () => 'grid',
  },
  noturno: {
    label: 'Noturno',
    description: 'Fundo escuro em toda a página, brilho na cor da marca, cartões translúcidos e fotos da galeria que ganham cor ao passar o mouse.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
  capa: {
    label: 'Capa',
    description: 'Foto do topo ocupando a largura toda com o texto por cima, serviços com ícone ao lado, galeria e depoimentos em carrossel.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
  organico: {
    label: 'Orgânico',
    description: 'Formas suaves: foto do topo em formato orgânico, fotos em arco, títulos centralizados e seções em faixas arredondadas.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
  aurora: {
    label: 'Aurora',
    description: 'Clean e luminoso: brilho suave nas cores da marca atrás do topo, cartões de vidro com borda fina e títulos centralizados.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
  linhas: {
    label: 'Linhas',
    description: 'Estilo tecnológico: grade de linhas finas no topo, serviços e diferenciais em células separadas por fios, cantos discretos.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
  suave: {
    label: 'Suave',
    description: 'Fundo levemente colorido, cartões brancos bem arredondados com sombra macia e ícones em círculos cheios na cor da marca.',
    hero: { withPhoto: 'split', withoutPhoto: 'split' },
    services: () => 'grid',
  },
  estudio: {
    label: 'Estúdio',
    description: 'Topo dividido com a foto até a borda da tela; no computador, o título de cada seção fica fixo à esquerda e o conteúdo à direita.',
    hero: { withPhoto: 'split', withoutPhoto: 'split' },
    services: (n) => (n <= 4 ? 'list' : 'grid'),
  },
  degrade: {
    label: 'Degradê',
    description: 'Moderno e vibrante: degradê da cor principal para a de destaque no topo, nos botões, nos ícones e no CTA final; resto da página bem limpo.',
    hero: { withPhoto: 'split', withoutPhoto: 'centered' },
    services: () => 'grid',
  },
};

// "logo": a foto escolhida vira o logotipo da página (no lugar do logotipo do cadastro)
export const IMAGE_PLACEMENTS = ['hero', 'about', 'gallery', 'hidden', 'logo'] as const;
export type ImagePlacement = (typeof IMAGE_PLACEMENTS)[number];

function normalizeImagePlacements(input: unknown): Record<string, ImagePlacement> {
  const out: Record<string, ImagePlacement> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [url, place] of Object.entries(input).slice(0, 300)) {
    if (url.length <= 2048 && IMAGE_PLACEMENTS.includes(place as ImagePlacement)) out[url] = place as ImagePlacement;
  }
  return out;
}

interface Preset {
  label: string;
  heading: { family: string; weight: number; query: string; case: 'none' | 'uppercase'; tracking: string; lineHeight: number };
  body: { family: string; query: string };
  colors: { bg: string; surface: string; text: string; muted: string; primary: string; accent: string };
  dark: boolean;
  radius: number;
  buttonRadius: number;
  servicesLayout: 'grid' | 'list';
  heroDefault: 'split' | 'centered';
}

export const PRESETS: Record<DesignPreset, Preset> = {
  health: {
    label: 'Saúde & Odontologia — clean e confiável',
    heading: { family: 'Plus Jakarta Sans', weight: 700, query: 'Plus+Jakarta+Sans:wght@400;500;600;700;800', case: 'none', tracking: '-0.025em', lineHeight: 1.08 },
    body: { family: 'Plus Jakarta Sans', query: '' },
    colors: { bg: '#ffffff', surface: '#f3f7f9', text: '#0f2130', muted: '#566779', primary: '#0f7c8a', accent: '#1d4f73' },
    dark: false, radius: 20, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'split',
  },
  legal: {
    label: 'Advocacia & Consultoria — sóbrio e elegante',
    heading: { family: 'Cormorant Garamond', weight: 600, query: 'Cormorant+Garamond:wght@500;600;700', case: 'none', tracking: '-0.01em', lineHeight: 1.05 },
    body: { family: 'Libre Franklin', query: 'Libre+Franklin:wght@400;500;600' },
    colors: { bg: '#faf8f4', surface: '#f1ece2', text: '#1a1916', muted: '#5f5a50', primary: '#1c2a3d', accent: '#a8864f' },
    dark: false, radius: 2, buttonRadius: 2, servicesLayout: 'list', heroDefault: 'split',
  },
  fitness: {
    label: 'Academia & Esportes — energético',
    heading: { family: 'Anton', weight: 400, query: 'Anton', case: 'uppercase', tracking: '0.005em', lineHeight: 1.0 },
    body: { family: 'Inter', query: 'Inter:wght@400;500;600;700' },
    colors: { bg: '#0c0c0e', surface: '#17171b', text: '#f4f4f5', muted: '#a1a1aa', primary: '#d4ff3a', accent: '#ff5a36' },
    dark: true, radius: 6, buttonRadius: 6, servicesLayout: 'grid', heroDefault: 'centered',
  },
  food: {
    label: 'Gastronomia — acolhedor e fotográfico',
    heading: { family: 'Fraunces', weight: 600, query: 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700', case: 'none', tracking: '-0.02em', lineHeight: 1.05 },
    body: { family: 'DM Sans', query: 'DM+Sans:wght@400;500;600;700' },
    colors: { bg: '#fbf6ef', surface: '#f3e8da', text: '#2b1d13', muted: '#6e5a4a', primary: '#a8402a', accent: '#3f5b3a' },
    dark: false, radius: 16, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'split',
  },
  realestate: {
    label: 'Imobiliário & Arquitetura — premium',
    heading: { family: 'Playfair Display', weight: 500, query: 'Playfair+Display:wght@400;500;600;700', case: 'none', tracking: '-0.015em', lineHeight: 1.08 },
    body: { family: 'Manrope', query: 'Manrope:wght@400;500;600;700' },
    colors: { bg: '#f7f6f3', surface: '#ecebe6', text: '#141414', muted: '#5d5b57', primary: '#161616', accent: '#a38654' },
    dark: false, radius: 2, buttonRadius: 2, servicesLayout: 'list', heroDefault: 'split',
  },
  beauty: {
    label: 'Estética & Beleza — leve e sofisticado',
    heading: { family: 'Cormorant Garamond', weight: 500, query: 'Cormorant+Garamond:ital,wght@0,500;0,600;1,500', case: 'none', tracking: '-0.01em', lineHeight: 1.05 },
    body: { family: 'Jost', query: 'Jost:wght@400;500;600' },
    colors: { bg: '#fdf9f7', surface: '#f6ebe6', text: '#2c2222', muted: '#6f5f5c', primary: '#96604f', accent: '#c7a193' },
    dark: false, radius: 28, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'split',
  },
  automotive: {
    label: 'Oficina & Indústria — robusto e direto',
    heading: { family: 'Barlow Condensed', weight: 700, query: 'Barlow+Condensed:wght@600;700;800', case: 'uppercase', tracking: '0.01em', lineHeight: 1.0 },
    body: { family: 'Barlow', query: 'Barlow:wght@400;500;600;700' },
    colors: { bg: '#f3f3f1', surface: '#e7e7e3', text: '#15171a', muted: '#555a60', primary: '#e0561c', accent: '#1d2127' },
    dark: false, radius: 4, buttonRadius: 4, servicesLayout: 'grid', heroDefault: 'centered',
  },
  tech: {
    label: 'Tecnologia & Agências — moderno',
    heading: { family: 'Space Grotesk', weight: 700, query: 'Space+Grotesk:wght@500;600;700', case: 'none', tracking: '-0.03em', lineHeight: 1.05 },
    body: { family: 'Inter', query: 'Inter:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#f4f5fa', text: '#0b1020', muted: '#555d73', primary: '#4f46e5', accent: '#0b1020' },
    dark: false, radius: 14, buttonRadius: 10, servicesLayout: 'grid', heroDefault: 'centered',
  },
  education: {
    label: 'Educação — acolhedor e claro',
    heading: { family: 'Outfit', weight: 700, query: 'Outfit:wght@400;500;600;700;800', case: 'none', tracking: '-0.025em', lineHeight: 1.08 },
    body: { family: 'Outfit', query: '' },
    colors: { bg: '#ffffff', surface: '#f4f7fd', text: '#101a33', muted: '#56607a', primary: '#2257d6', accent: '#f0a020' },
    dark: false, radius: 18, buttonRadius: 12, servicesLayout: 'grid', heroDefault: 'split',
  },
  professional: {
    label: 'Serviços profissionais — focado em conversão',
    heading: { family: 'Sora', weight: 700, query: 'Sora:wght@500;600;700;800', case: 'none', tracking: '-0.03em', lineHeight: 1.08 },
    body: { family: 'Inter', query: 'Inter:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#f5f6f8', text: '#101828', muted: '#5b6474', primary: '#1d4ed8', accent: '#0f172a' },
    dark: false, radius: 12, buttonRadius: 10, servicesLayout: 'grid', heroDefault: 'split',
  },
  ocean: {
    label: 'Oceano — azul-petróleo e âmbar, leve',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Figtree', query: 'Figtree:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#eff6f8', text: '#0b2530', muted: '#52707c', primary: '#0e7490', accent: '#f59e0b' },
    dark: false, radius: 16, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'split',
  },
  forest: {
    label: 'Floresta — verde natural e acolhedor',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Nunito Sans', query: 'Nunito+Sans:wght@400;600;700' },
    colors: { bg: '#fbfcf8', surface: '#eef3ea', text: '#17241a', muted: '#5a6b5c', primary: '#2f6b3f', accent: '#c08a3e' },
    dark: false, radius: 18, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'split',
  },
  terracotta: {
    label: 'Terracota — quente e artesanal',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Work Sans', query: 'Work+Sans:wght@400;500;600;700' },
    colors: { bg: '#fffaf5', surface: '#f7ebe0', text: '#2a1a12', muted: '#6e5646', primary: '#c2553a', accent: '#2f4858' },
    dark: false, radius: 14, buttonRadius: 10, servicesLayout: 'grid', heroDefault: 'split',
  },
  lavender: {
    label: 'Lavanda — lilás delicado e moderno',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Poppins', query: 'Poppins:wght@400;500;600' },
    colors: { bg: '#fdfcff', surface: '#f3f0fb', text: '#1e1633', muted: '#625a78', primary: '#7c5cd6', accent: '#e86fa3' },
    dark: false, radius: 22, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'centered',
  },
  graphite: {
    label: 'Grafite — preto e branco minimalista',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Inter', query: 'Inter:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#f4f4f5', text: '#09090b', muted: '#52525b', primary: '#18181b', accent: '#2563eb' },
    dark: false, radius: 10, buttonRadius: 8, servicesLayout: 'list', heroDefault: 'split',
  },
  coral: {
    label: 'Coral — vibrante e jovem',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Rubik', query: 'Rubik:wght@400;500;600' },
    colors: { bg: '#ffffff', surface: '#fff3f0', text: '#1f1414', muted: '#6b5552', primary: '#e8484f', accent: '#2b2d42' },
    dark: false, radius: 16, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'centered',
  },
  mint: {
    label: 'Menta — fresco e limpo',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Manrope', query: 'Manrope:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#effaf6', text: '#0f2a24', muted: '#4f6f67', primary: '#0e9f7a', accent: '#0f2a24' },
    dark: false, radius: 18, buttonRadius: 12, servicesLayout: 'grid', heroDefault: 'split',
  },
  midnight: {
    label: 'Meia-noite — escuro com dourado',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Inter', query: 'Inter:wght@400;500;600;700' },
    colors: { bg: '#0d1321', surface: '#151d2e', text: '#eef2f8', muted: '#9aa6bb', primary: '#f2c94c', accent: '#5b8def' },
    dark: true, radius: 14, buttonRadius: 999, servicesLayout: 'grid', heroDefault: 'centered',
  },
  sand: {
    label: 'Areia — bege e marrom, luxo discreto',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Lato', query: 'Lato:wght@400;700' },
    colors: { bg: '#f8f5f0', surface: '#efe9df', text: '#1f1b16', muted: '#6b6359', primary: '#8a6a4a', accent: '#1f1b16' },
    dark: false, radius: 6, buttonRadius: 999, servicesLayout: 'list', heroDefault: 'split',
  },
  royal: {
    label: 'Real — azul-marinho e dourado, institucional',
    heading: { family: 'Montserrat', weight: 700, query: 'Montserrat:wght@500;600;700;800', case: 'none', tracking: '-0.02em', lineHeight: 1.1 },
    body: { family: 'Plus Jakarta Sans', query: 'Plus+Jakarta+Sans:wght@400;500;600;700' },
    colors: { bg: '#ffffff', surface: '#f2f5fb', text: '#0c1630', muted: '#55607a', primary: '#1e3a8a', accent: '#c9971c' },
    dark: false, radius: 12, buttonRadius: 10, servicesLayout: 'grid', heroDefault: 'split',
  },
};

// ─── Cor ────────────────────────────────────────────────────────────
const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

function toRgb(hex: string): [number, number, number] {
  const h = HEX_RE.exec(hex.trim())![1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex([r, g, b]: number[]) {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}
export function mix(a: string, b: string, amount: number) {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex(A.map((c, i) => c + (B[i] - c) * amount));
}
function luminance(hex: string) {
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

export interface ResolvedTheme {
  preset: DesignPreset;
  p: Preset;
  heroVariant: 'split' | 'centered';
  sections: Record<string, SectionColors>;
  images: Record<string, ImagePlacement>;
  template: TemplateKey;
  focus: Record<string, ImageFocus>;
  imageOrder: string[];
  mobileOrder: string[];
  elementColors: ElementColors;
  sectionSpacing: SectionSpacing;
  imageSize: ImageSizes;
  logoPlacement: LogoPlacement;
  removeEmojis: boolean;
  brand: BrandDisplay;
  fontsHref: string;
  vars: Record<string, string>;
}

export function normalizeThemeSettings(input: any): ThemeSettings {
  const preset = DESIGN_PRESETS.includes(input?.preset) ? input.preset : 'professional';
  return {
    preset,
    primary: isHex(input?.primary) ? normalizeHex(input.primary) : null,
    accent: isHex(input?.accent) ? normalizeHex(input.accent) : null,
    // "image" (foto de fundo em tela cheia) foi descontinuado: a foto do topo fica emoldurada, como em "Sobre"
    heroVariant: input?.heroVariant === 'centered' ? 'centered' : input?.heroVariant === 'split' || input?.heroVariant === 'image' ? 'split' : PRESETS[preset as DesignPreset].heroDefault,
    sections: normalizeSectionColors(input?.sections),
    images: normalizeImagePlacements(input?.images),
    template: TEMPLATE_KEYS.includes(input?.template) ? input.template : 'classico',
    focus: normalizeFocus(input?.focus),
    imageOrder: Array.isArray(input?.imageOrder)
      ? [...new Set<string>(input.imageOrder.filter((u: unknown) => typeof u === 'string' && u.length <= 2048))].slice(0, 300)
      : [],
    mobileOrder: Array.isArray(input?.mobileOrder)
      ? [...new Set<string>(input.mobileOrder.filter((k: unknown) => typeof k === 'string' && /^(about|services|differentials|products|gallery|testimonials|faq|custom:[a-z0-9-]{1,40})$/.test(k)))].slice(0, 60)
      : [],
    elementColors: normalizeElementColors(input?.elementColors),
    sectionSpacing: normalizeSectionSpacing(input?.sectionSpacing),
    imageSize: normalizeImageSizes(input?.imageSize),
    logoPlacement: input?.logoPlacement === 'hero' || input?.logoPlacement === 'about' ? input.logoPlacement : 'header',
    removeEmojis: input?.removeEmojis === true,
    brand: input?.brand === 'name' || input?.brand === 'both' ? input.brand : 'logo',
  };
}

function normalizeHex(v: string) {
  const t = v.trim().toLowerCase();
  return t.startsWith('#') ? t : `#${t}`;
}

/**
 * Todos os títulos usam Montserrat, em qualquer estilo. Peso, espaçamento e altura de linha
 * são ajustados a ela; caixa alta continua vindo do estilo.
 */
export const HEADING_FAMILY = 'Montserrat';
export function headingFont(p: { heading: { weight: number; case: 'none' | 'uppercase'; lineHeight: number } }) {
  const upper = p.heading.case === 'uppercase';
  return {
    family: HEADING_FAMILY,
    query: 'Montserrat:wght@500;600;700;800',
    weight: upper ? 800 : Math.min(Math.max(p.heading.weight, 600), 700),
    tracking: upper ? '0.01em' : '-0.02em',
    lineHeight: Math.max(p.heading.lineHeight, 1.1),
  };
}

export function resolveTheme(settings: ThemeSettings): ResolvedTheme {
  const p = PRESETS[settings.preset] ?? PRESETS.professional;
  const c = p.colors;
  const primary = settings.primary ?? c.primary;
  const accent = settings.accent ?? c.accent;

  // Garantias de legibilidade (WCAG): texto de destaque ≥ 4.5, botões com texto legível
  const primaryInk = ensureContrast(primary, c.bg, 4.5);
  const accentInk = ensureContrast(accent, c.bg, 3);
  const band = p.dark ? c.surface : ensureContrast(mix(c.text, primary, 0.12), '#ffffff', 12);
  const bandText = readableOn(band);
  const bandAccent = ensureContrast(p.dark ? primary : mix(primary, '#ffffff', 0.35), band, 4.5);

  const h = headingFont(p);
  // Corpo sem query própria usava a mesma família do título do preset: carrega essa família para o texto
  const families = [h.query, p.body.query || p.heading.query].filter(Boolean).map((q) => `family=${q}`).join('&');
  return {
    preset: settings.preset,
    p,
    heroVariant: settings.heroVariant ?? p.heroDefault,
    sections: settings.sections ?? {},
    images: settings.images ?? {},
    template: settings.template ?? 'classico',
    focus: settings.focus ?? {},
    imageOrder: settings.imageOrder ?? [],
    mobileOrder: settings.mobileOrder ?? [],
    elementColors: settings.elementColors ?? { desktop: {}, mobile: {} },
    sectionSpacing: settings.sectionSpacing ?? {},
    imageSize: settings.imageSize ?? {},
    logoPlacement: settings.logoPlacement ?? 'header',
    removeEmojis: settings.removeEmojis === true,
    brand: settings.brand ?? 'logo',
    fontsHref: `https://fonts.googleapis.com/css2?${families}&display=swap`,
    vars: {
      '--bg': c.bg,
      '--surface': c.surface,
      '--text': c.text,
      '--muted': ensureContrast(c.muted, c.bg, 4.5),
      '--border': mix(c.bg, c.text, p.dark ? 0.16 : 0.1),
      '--primary': primary,
      '--on-primary': readableOn(primary),
      '--primary-ink': primaryInk,
      '--primary-soft': mix(c.bg, primary, p.dark ? 0.16 : 0.09),
      '--accent': accent,
      '--accent-ink': accentInk,
      '--band': band,
      '--band-text': bandText,
      '--band-muted': mix(bandText, band, 0.32),
      '--band-accent': bandAccent,
      '--band-border': mix(band, bandText, 0.16),
      '--radius': `${p.radius}px`,
      '--radius-sm': `${Math.min(p.radius, 12)}px`,
      '--btn-radius': `${p.buttonRadius}px`,
      '--font-heading': `'${h.family}', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`,
      '--font-body': `'${p.body.family}', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`,
      '--heading-weight': String(h.weight),
      '--heading-case': p.heading.case,
      '--heading-tracking': h.tracking,
      '--heading-lh': String(h.lineHeight),
    },
  };
}
