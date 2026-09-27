import { z } from 'zod';

// ─── Vocabulários controlados ───────────────────────────────────────
export const DESIGN_PRESETS = [
  'health',       // odontologia, clínicas, saúde
  'legal',        // advocacia, contabilidade, consultoria
  'fitness',      // academias, esportes
  'food',         // restaurantes, cafés, padarias
  'realestate',   // imobiliárias, arquitetura, construtoras
  'beauty',       // estética, salões, spas
  'automotive',   // oficinas, auto centers, indústria
  'tech',         // software, agências, marketing
  'education',    // escolas, cursos
  'professional', // serviços em geral (padrão)
] as const;
export type DesignPreset = (typeof DESIGN_PRESETS)[number];

export const SECTION_KEYS = [
  'about', 'services', 'differentials', 'products', 'gallery', 'testimonials', 'faq', 'contact', 'final_cta',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const ICONS = [
  'check', 'star', 'shield', 'clock', 'heart', 'users', 'sparkles', 'calendar', 'briefcase', 'home', 'building',
  'wrench', 'zap', 'target', 'award', 'leaf', 'truck', 'smile', 'package', 'chart', 'lightbulb', 'scale',
  'dumbbell', 'utensils', 'car', 'scissors', 'stethoscope', 'graduation', 'code', 'camera', 'globe', 'tooth',
  'sliders', 'phone', 'mail', 'map-pin', 'message',
] as const;
export type IconName = (typeof ICONS)[number];

export const IMAGE_TYPES = ['logo', 'company', 'product', 'service', 'institutional', 'gallery', 'other'] as const;

// ─── Extração: o que a IA identifica no site ───────────────────────
export const ExtractedCompanySchema = z.object({
  name: z.string().describe('Nome da empresa como aparece no site'),
  trade_name: z.string().nullable().describe('Nome fantasia/comercial, se diferente do nome'),
  legal_name: z.string().nullable().describe('Razão social (ex.: "... LTDA"), somente se escrita no site'),
  segment: z.string().nullable().describe('Segmento de atuação em português, ex.: "Clínica odontológica"'),
  design_preset: z.enum(DESIGN_PRESETS).describe('Categoria visual mais próxima do segmento'),
  description: z.string().nullable().describe('Resumo factual de 2 a 4 frases sobre a empresa, baseado apenas no site'),
  contacts: z.object({
    phone: z.string().nullable(),
    mobile: z.string().nullable(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable().describe('Logradouro (rua/avenida), sem número'),
    number: z.string().nullable(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable().describe('UF com 2 letras'),
    zip_code: z.string().nullable(),
  }),
  socials: z.object({
    instagram: z.string().nullable(),
    facebook: z.string().nullable(),
    youtube: z.string().nullable(),
    linkedin: z.string().nullable(),
    tiktok: z.string().nullable(),
    others: z.array(z.object({ network: z.string(), url: z.string() })),
  }),
  opening_hours: z.string().nullable().describe('Dias e horários de funcionamento, ex.: "Seg a Sex, 8h às 18h · Sáb, 8h às 12h"'),
  services: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      benefits: z.array(z.string()),
      details: z.string().nullable(),
    }),
  ),
  products: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      features: z.array(z.string()),
      benefits: z.array(z.string()),
    }),
  ),
  commercial: z.object({
    differentials: z.array(z.string()),
    selling_points: z.array(z.string()),
    benefits: z.array(z.string()),
    target_audience: z.string().nullable(),
    calls_to_action: z.array(z.string()),
    promotions: z.array(z.string()),
    guarantees: z.array(z.string()),
    additional_info: z.array(z.string()),
  }),
  testimonials: z.array(
    z.object({
      author: z.string().nullable(),
      text: z.string().describe('Trecho copiado literalmente do site'),
    }),
  ),
  images: z.array(
    z.object({
      index: z.number().int().describe('Índice da imagem na lista IMAGENS ENCONTRADAS'),
      type: z.enum(IMAGE_TYPES),
      alt_text: z.string(),
    }),
  ),
  logo_index: z.number().int().nullable(),
  missing_info: z.array(z.string()).describe('Informações importantes que não foram encontradas'),
});
export type ExtractedCompany = z.infer<typeof ExtractedCompanySchema>;

// ─── Geração: conteúdo e direção visual da Landing Page ────────────
const iconEnum = z.enum(ICONS);

export const LandingContentSchema = z.object({
  design: z.object({
    preset: z.enum(DESIGN_PRESETS),
    primary_color: z.string().describe('Cor principal em hexadecimal #RRGGBB'),
    accent_color: z.string().describe('Cor de destaque em hexadecimal #RRGGBB'),
    hero_variant: z.enum(['split', 'centered', 'image']),
    rationale: z.string().describe('Uma frase explicando a direção visual escolhida'),
  }),
  seo: z.object({
    title: z.string().describe('Até 60 caracteres'),
    description: z.string().describe('Entre 120 e 160 caracteres'),
    keywords: z.array(z.string()),
  }),
  hero: z.object({
    eyebrow: z.string().nullable().describe('Linha curta acima do título (segmento + cidade, por exemplo)'),
    headline: z.string(),
    subheadline: z.string(),
    primary_cta: z.string(),
    secondary_cta: z.string().nullable(),
    highlights: z.array(z.string()).describe('2 a 4 fatos curtos e verificáveis'),
  }),
  about: z.object({ title: z.string(), paragraphs: z.array(z.string()) }).nullable(),
  services: z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(
        z.object({ name: z.string(), description: z.string(), benefit: z.string().nullable(), icon: iconEnum }),
      ),
    })
    .nullable(),
  differentials: z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(z.object({ title: z.string(), description: z.string(), icon: iconEnum })),
    })
    .nullable(),
  products: z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(z.object({ name: z.string(), description: z.string(), features: z.array(z.string()) })),
    })
    .nullable(),
  gallery: z.object({ title: z.string(), subtitle: z.string().nullable() }).nullable(),
  testimonials: z.object({ title: z.string() }).nullable(),
  faq: z
    .object({ title: z.string(), items: z.array(z.object({ question: z.string(), answer: z.string() })) })
    .nullable(),
  contact: z.object({ title: z.string(), subtitle: z.string().nullable() }),
  final_cta: z.object({ title: z.string(), subtitle: z.string().nullable(), cta: z.string() }),
  section_order: z.array(z.enum(SECTION_KEYS)),
});
export type LandingContent = z.infer<typeof LandingContentSchema> & { labels?: Record<string, string> };

/** Conteúdo editado manualmente: igual ao gerado, mais os rótulos fixos da página. */
export const LandingContentEditSchema = LandingContentSchema.extend({
  labels: z.record(z.string(), z.string().max(120)).optional(),
});

// ─── Classificação apenas das imagens (busca de fotos em empresa já cadastrada) ──
export const ImageClassificationSchema = z.object({
  logo_index: z.number().int().nullable(),
  images: z.array(z.object({ index: z.number().int(), type: z.enum(IMAGE_TYPES), alt_text: z.string() })),
});
export type ImageClassification = z.infer<typeof ImageClassificationSchema>;
