export type LpStatus = 'ativa' | 'inativa';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
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
  design: { preset: string; primary_color: string; accent_color: string; hero_variant: HeroVariant; rationale: string };
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
  section_order: SectionKey[];
  labels?: Record<string, string>;
}

export type HeroVariant = 'split' | 'centered' | 'image';

export interface ThemeSettings {
  preset: string;
  primary: string | null;
  accent: string | null;
  heroVariant: HeroVariant;
}

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
