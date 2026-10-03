export type LpStatus = 'ativa' | 'inativa';

export type UserRole = 'owner' | 'admin' | 'editor' | 'seller' | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Conta de cliente: a Landing Page que ela edita */
  landing_page_id?: string | null;
}

/** Login do cliente para editar só a própria Landing Page. */
export interface ClientAccess {
  id: string;
  name: string;
  email: string;
  last_login_at: string | null;
  created_at: string;
}

export interface SubUser extends User {
  last_login_at: string | null;
  created_at: string;
}

export interface SalesCompany {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  created_at: string;
  slug: string | null;
  notes_count: number;
  last_note_at: string | null;
}

export interface ProspectingNote {
  id: string;
  author_name: string;
  note: string;
  created_at: string;
}

export interface Service {
  name: string;
  description: string | null;
  benefits: string[];
  details: string | null;
}

export interface Product {
  name: string;
  description: string | null;
  features: string[];
  benefits: string[];
}

export type ImageType = 'logo' | 'company' | 'product' | 'service' | 'institutional' | 'gallery' | 'other';

export interface CompanyImage {
  url: string;
  type: ImageType;
  alt_text: string | null;
  source: 'scraped' | 'upload' | 'manual';
  usage_allowed: boolean;
}

export interface Testimonial {
  author: string | null;
  text: string;
  source_url: string | null;
}

export interface CommercialInfo {
  differentials?: string[];
  selling_points?: string[];
  benefits?: string[];
  target_audience?: string | null;
  calls_to_action?: string[];
  promotions?: string[];
  guarantees?: string[];
  additional_info?: string[];
}

/** Dados editáveis de uma empresa (formulário de revisão e de edição). */
export interface CompanyDraft {
  name: string;
  trade_name: string | null;
  legal_name: string | null;
  description: string | null;
  segment: string | null;
  reference_url: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  linkedin: string | null;
  tiktok: string | null;
  other_socials: { network: string; url: string }[];
  opening_hours: string | null;
  commercial_info: CommercialInfo;
  services: Service[];
  products: Product[];
  images: CompanyImage[];
  testimonials: Testimonial[];
}

export interface Company extends CompanyDraft {
  id: string;
  logo_url: string | null;
  source_meta: AnalysisMeta | Record<string, never>;
  created_at: string;
  updated_at: string;
  landing_page: { id: string; slug: string; status: LpStatus } | null;
}

export interface CompanyListItem {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  created_at: string;
  landing_page_id: string | null;
  slug: string | null;
  status: LpStatus | null;
}

export interface AnalysisMeta {
  final_url: string;
  pages: string[];
  missing_info: string[];
  removed: string[];
  analyzed_at: string;
}

export interface AnalysisResult {
  draft: CompanyDraft;
  design_preset: string;
  meta: AnalysisMeta;
}

export interface Job<T = unknown> {
  id: string;
  type: 'analyze_url' | 'generate_landing_page';
  status: 'queued' | 'running' | 'done' | 'error';
  step: number;
  error: string | null;
  result: T | null;
}

export type IconName = string;
export type SectionKey = 'about' | 'services' | 'differentials' | 'products' | 'gallery' | 'testimonials' | 'faq' | 'contact' | 'final_cta';

export interface LandingContent {
  design: { preset: string; primary_color: string; accent_color: string; hero_variant: HeroVariant | 'image'; rationale: string };
  seo: { title: string; description: string; keywords: string[] };
  hero: { eyebrow: string | null; headline: string; subheadline: string; primary_cta: string; secondary_cta: string | null; highlights: string[] };
  about: { title: string; paragraphs: string[] } | null;
  services: { title: string; subtitle: string | null; items: { name: string; description: string; benefit: string | null; icon: IconName }[] } | null;
  differentials: { title: string; subtitle: string | null; items: { title: string; description: string; icon: IconName }[] } | null;
  products: { title: string; subtitle: string | null; items: { name: string; description: string; features: string[] }[] } | null;
  gallery: { title: string; subtitle: string | null } | null;
  testimonials: { title: string } | null;
  faq: { title: string; items: { question: string; answer: string }[] } | null;
  contact: { title: string; subtitle: string | null };
  final_cta: { title: string; subtitle: string | null; cta: string };
  section_order: SectionOrderKey[];
  labels?: Record<string, string>;
  custom_sections?: CustomSection[];
  /** Seções desativadas: continuam salvas e na ordem, mas não aparecem no site */
  hidden_sections?: SectionOrderKey[];
  /** Textos do cadastro trocados só nesta LP (nome, contatos, depoimentos...) */
  overrides?: Record<string, string>;
}

/** Seção livre criada pelo administrador. */
export interface CustomSection {
  id: string;
  eyebrow: string | null;
  title: string;
  paragraphs: string[];
  items: string[];
  /** Elementos livres (ausente em páginas antigas) */
  blocks?: SectionBlock[];
  align?: 'left' | 'center';
}

export type BlockWidth = 'full' | 'half' | 'third';

/** Elemento de uma seção personalizada. */
export type SectionBlock = { id: string; width: BlockWidth } & (
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string; caption: string | null }
  | { type: 'icon'; icon: string; title: string; text: string | null }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }
);
export type BlockType = SectionBlock['type'];
export type SectionOrderKey = SectionKey | `custom:${string}`;

/** Conteúdo completo coletado do site. */
export interface CompanySources {
  pages: { url: string; title: string | null; description: string | null; content: string; fetched_at: string }[];
  data: {
    final_url?: string;
    fetched_at?: string;
    phones?: string[];
    whatsapps?: string[];
    emails?: string[];
    socials?: { network: string; url: string }[];
    zip_codes?: string[];
    images?: { url: string; width?: number; height?: number; alt: string }[];
    json_ld?: unknown[];
  };
}

export type HeroVariant = 'split' | 'centered';

export interface SectionColors {
  bg?: string | null;
  text?: string | null;
  accent?: string | null;
}

export interface ThemeSettings {
  preset: string;
  primary: string | null;
  accent: string | null;
  heroVariant: HeroVariant;
  /** Cores próprias por seção: hero, about, services…, custom:<id>, footer */
  sections?: Record<string, SectionColors>;
  /** Local escolhido para cada foto (chave = URL). Sem entrada = automático. */
  images?: Record<string, ImagePlacement>;
  /** Modelo de layout da página (estrutura); cores e fontes vêm do preset. */
  template?: TemplateKey;
  /** Ponto de corte (0–100%) das fotos do topo e de "sobre", por URL. */
  focus?: Record<string, ImageFocus>;
  /** Ordem das fotos (URLs) escolhida no editor. */
  imageOrder?: string[];
  /** Ordem das seções só no celular (arrastada na prévia). Vazia = igual ao computador. */
  mobileOrder?: string[];
  /** Cores de elementos clicados na prévia, por layout. */
  elementColors?: ElementColors;
  /** Margem interna (topo/base) das seções em % do padrão (20–100), por layout. Ausente = 100%. */
  sectionSpacing?: SectionSpacing;
  /** Onde o logotipo aparece: cabeçalho (padrão), início do conteúdo ou seção "Sobre" */
  logoPlacement?: 'header' | 'hero' | 'about';
}

export interface SectionSpacing {
  desktop?: number;
  mobile?: number;
  /** Espaço próprio de cada seção (0–150%), arrastado na prévia no modo "Espaços" */
  sections?: { desktop?: Record<string, number>; mobile?: Record<string, number> };
}

/** Cor escolhida para um elemento (chave = seletor CSS gerado pelo editor). */
export interface ElementColor {
  text?: string;
  bg?: string;
  /** Tamanho da fonte em px */
  size?: number;
  /** Fonte escolhida (chave de TEXT_FONTS) */
  font?: string;
  /** true = negrito, false = sem negrito (ausente = padrão do modelo) */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface ElementColors {
  desktop: Record<string, ElementColor>;
  mobile: Record<string, ElementColor>;
}

export interface ImageFocus {
  x: number;
  y: number;
  /** Zoom (1 = sem zoom, até 3) */
  z?: number;
}

export type TemplateKey = 'classico' | 'moderno' | 'minimalista' | 'elegante' | 'impacto' | 'revista' | 'blocos' | 'noturno' | 'capa' | 'organico';

export interface TemplateInfo {
  key: TemplateKey;
  label: string;
  description: string;
  hero: { withPhoto: HeroVariant; withoutPhoto: HeroVariant };
}

export type ImagePlacement = 'hero' | 'about' | 'gallery' | 'hidden' | 'logo';

export interface LandingPage {
  id: string;
  company_id: string;
  title: string;
  slug: string;
  status: LpStatus;
  content: LandingContent;
  theme: ThemeSettings;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image: string | null;
  current_version: number;
  custom_domain: string | null;
  domain_status: 'none' | 'pending' | 'verified' | 'active' | 'error';
  ssl_status: 'none' | 'pending' | 'active' | 'error';
  created_at: string;
  updated_at: string;
  published_at: string | null;
  public_url: string;
  path_url: string;
}

export interface LandingPageDetail extends LandingPage {
  company: { id: string; name: string; segment: string | null; testimonials: number; images_allowed: number } | null;
  versions: { version: number; note: string | null; created_at: string; author: string | null }[];
}

export interface LandingPageListItem {
  id: string;
  title: string;
  slug: string;
  status: LpStatus;
  custom_domain: string | null;
  domain_status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  company_id: string;
  company_name: string;
  segment: string | null;
  public_url: string;
}

export interface Preset {
  key: string;
  label: string;
  primary: string;
  accent: string;
  bg: string;
  heading: string;
  heroDefault: HeroVariant;
}

export interface DashboardStats {
  companies: number;
  landing_pages: number;
  active: number;
  inactive: number;
  recent: { id: string; slug: string; status: LpStatus; created_at: string; company_name: string; segment: string | null }[];
}

export interface AIKeyInfo {
  id: string;
  label: string | null;
  last4: string;
  active: boolean;
  uses: number;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
}

/** Empresa encontrada em "Buscar empresas". */
export interface FoundCompany {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  url: string | null;
  description: string | null;
  /** Página do local no Google Maps */
  google_url: string | null;
  /** Fotos do perfil no Google e código do local (quando a fonte os traz) */
  photos?: string[];
  place_id?: string | null;
  source: 'maps' | 'web';
  /** Empresa já cadastrada (e a LP dela, se já foi gerada) */
  existing: { id: string; name: string; reason: 'link' | 'site' | 'nome_telefone' | 'nome_cep'; landing_page: { id: string; slug: string; status: LpStatus } | null } | null;
}

/** Dados do Google Maps de um local escolhido na pesquisa, enviados à análise. */
export interface PlaceListing {
  name: string;
  phone: string | null;
  address: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  photos?: string[] | null;
  place_id?: string | null;
  google_url?: string | null;
}

/** Pesquisa salva no histórico de "Buscar empresas". */
export interface SavedSearchItem {
  id: string;
  query: string;
  count: number;
  created_at: string;
  updated_at: string;
  author: string | null;
}
