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
  // Paletas de estilo (servem a qualquer segmento)
  'ocean',        // azul-petróleo e âmbar, leve
  'forest',       // verde natural, sustentável, pet, jardinagem
  'terracotta',   // terracota quente, artesanal, decoração
  'lavender',     // lilás e rosa, delicado, bem-estar, infantil
  'graphite',     // preto e branco minimalista, estúdios, arquitetura
  'coral',        // coral vibrante, eventos, moda, jovem
  'mint',         // verde-menta, fresco, saúde, limpeza
  'midnight',     // azul-noite e dourado, escuro e premium
  'sand',         // bege e marrom, luxo discreto
  'royal',        // azul-marinho e dourado, institucional
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
// Na edição manual vale qualquer ícone da biblioteca do editor (desconhecido vira "check" na página)
const editIcon = z.string().regex(/^[a-z0-9-]{1,40}$/);

function servicesSchema<I extends z.ZodType<string>>(icon: I) {
  return z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(z.object({ name: z.string(), description: z.string(), benefit: z.string().nullable(), icon })),
    })
    .nullable();
}

function differentialsSchema<I extends z.ZodType<string>>(icon: I) {
  return z
    .object({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(z.object({ title: z.string(), description: z.string(), icon })),
    })
    .nullable();
}

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
  services: servicesSchema(iconEnum),
  differentials: differentialsSchema(iconEnum),
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
/** Elemento livre de uma seção personalizada (título, texto, foto, ícone, botão, divisória). */
const blockBase = {
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  // Largura no computador; no celular todos ocupam a linha inteira
  width: z.enum(['full', 'half', 'third']).default('full'),
};
export const SectionBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...blockBase, type: z.literal('heading'), text: z.string().max(300) }),
  z.object({ ...blockBase, type: z.literal('text'), text: z.string().max(8000) }),
  z.object({
    ...blockBase,
    type: z.literal('image'),
    url: z.string().max(2048),
    alt: z.string().max(300).default(''),
    caption: z.string().max(300).nullable().default(null),
  }),
  z.object({ ...blockBase, type: z.literal('icon'), icon: z.string().max(40), title: z.string().max(200), text: z.string().max(2000).nullable().default(null) }),
  // Link vazio = contato principal da página (WhatsApp, telefone ou e-mail)
  z.object({ ...blockBase, type: z.literal('button'), label: z.string().max(120), url: z.string().max(2048).default('') }),
  z.object({ ...blockBase, type: z.literal('divider') }),
]);
export type SectionBlock = z.infer<typeof SectionBlockSchema>;

/** Seção criada pelo administrador (qualquer conteúdo do site ou texto próprio). */
export const CustomSectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  eyebrow: z.string().max(120).nullable().default(null),
  title: z.string().max(300),
  paragraphs: z.array(z.string().max(8000)).max(40).default([]),
  items: z.array(z.string().max(600)).max(60).default([]),
  blocks: z.array(SectionBlockSchema).max(60).default([]),
  align: z.enum(['left', 'center']).default('left'),
});
export type CustomSection = z.infer<typeof CustomSectionSchema>;

/** Item da ordem das seções: uma seção padrão ou "custom:<id>". */
export type SectionOrderKey = SectionKey | `custom:${string}`;

export type LandingContent = Omit<z.infer<typeof LandingContentSchema>, 'section_order'> & {
  section_order: SectionOrderKey[];
  labels?: Record<string, string>;
  custom_sections?: CustomSection[];
  /** Seções desativadas: continuam salvas e na ordem, mas não aparecem no site */
  hidden_sections?: SectionOrderKey[];
  /** Textos do cadastro trocados só nesta LP (chave: "company.name", "contact.phone", "testimonial.<id>.text"...) */
  overrides?: Record<string, string>;
};

/** Conteúdo editado manualmente: igual ao gerado, mais rótulos e seções personalizadas. */
export const LandingContentEditSchema = LandingContentSchema.extend({
  services: servicesSchema(editIcon),
  differentials: differentialsSchema(editIcon),
  labels: z.record(z.string(), z.string().max(400)).optional(),
  custom_sections: z.array(CustomSectionSchema).max(20).optional(),
  overrides: z.record(z.string().regex(/^[a-z_]+(\.[a-z0-9_-]+){1,2}$/i).max(100), z.string().max(4000)).optional(),
  section_order: z
    .array(z.string().regex(/^(about|services|differentials|products|gallery|testimonials|faq|contact|final_cta|custom:[a-z0-9-]{1,40})$/))
    .max(60),
  hidden_sections: z
    .array(z.string().regex(/^(about|services|differentials|products|gallery|testimonials|faq|custom:[a-z0-9-]{1,40})$/))
    .max(60)
    .optional(),
});

// ─── Classificação apenas das imagens (busca de fotos em empresa já cadastrada) ──
export const ImageClassificationSchema = z.object({
  logo_index: z.number().int().nullable(),
  images: z.array(z.object({ index: z.number().int(), type: z.enum(IMAGE_TYPES), alt_text: z.string() })),
});
export type ImageClassification = z.infer<typeof ImageClassificationSchema>;
