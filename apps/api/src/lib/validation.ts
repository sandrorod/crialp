import { z } from 'zod';
import { badRequest } from './errors.js';
import { IMAGE_TYPES } from '../services/ai/schemas.js';

/** Texto opcional: aparado, com limite de tamanho; vazio vira null. */
export const text = (max = 500) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const t = v?.replace(/\s+/g, ' ').trim();
      return t ? t : null;
    });

export const longText = (max = 5000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    });

/** URL http(s) ou caminho de upload local. Bloqueia javascript:, data: etc. */
export const safeUrl = z
  .string()
  .max(2048)
  .nullish()
  .transform((v, ctx) => {
    const t = v?.trim();
    if (!t) return null;
    if (/^\/uploads\/[\w\-./]+$/.test(t)) return t;
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    try {
      const u = new URL(withProto);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      return u.toString();
    } catch {
      ctx.addIssue({ code: 'custom', message: `URL inválida: ${t}` });
      return z.NEVER;
    }
  });

/** Itens longos (textos extraídos do site pela IA) são cortados em vez de recusar o cadastro inteiro. */
const LIST_ITEM_MAX = 2000;
const stringList = (max = 30) =>
  z
    .array(z.string())
    .default([])
    .transform((arr) => [...new Set(arr.map((s) => s.trim().slice(0, LIST_ITEM_MAX).trim()).filter(Boolean))].slice(0, max));

export const CommercialInfoSchema = z
  .object({
    differentials: stringList(),
    selling_points: stringList(),
    benefits: stringList(),
    target_audience: text(1000),
    calls_to_action: stringList(),
    promotions: stringList(),
    guarantees: stringList(),
    additional_info: stringList(60),
  })
  .partial()
  .default({});

export const CompanyInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da empresa.').max(200),
  trade_name: text(200),
  legal_name: text(200),
  description: longText(3000),
  segment: text(120),
  reference_url: safeUrl,
  logo_url: safeUrl,
  phone: text(40),
  mobile: text(40),
  whatsapp: text(40),
  email: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'),
  address: text(300),
  number: text(30),
  neighborhood: text(120),
  city: text(120),
  state: text(40),
  zip_code: text(20),
  website: safeUrl,
  instagram: safeUrl,
  facebook: safeUrl,
  youtube: safeUrl,
  linkedin: safeUrl,
  tiktok: safeUrl,
  other_socials: z
    .array(z.object({ network: z.string().trim().max(60), url: safeUrl }))
    .max(20)
    .default([])
    .transform((arr) => arr.filter((s): s is { network: string; url: string } => !!s.url)),
  opening_hours: longText(1000),
  commercial_info: CommercialInfoSchema,
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: longText(2000),
        benefits: stringList(15),
        details: longText(2000),
      }),
    )
    .max(60)
    .default([]),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: longText(2000),
        features: stringList(15),
        benefits: stringList(15),
      }),
    )
    .max(60)
    .default([]),
  images: z
    .array(
      z.object({
        url: safeUrl.refine((v) => !!v, 'URL da imagem inválida.').transform((v) => v as string),
        type: z.enum(IMAGE_TYPES).default('other'),
        alt_text: text(300),
        source: z.enum(['scraped', 'upload', 'manual']).default('manual'),
        usage_allowed: z.boolean().default(false),
      }),
    )
    .max(60)
    .default([]),
  testimonials: z
    .array(z.object({ author: text(200), text: z.string().trim().min(1).max(3000), source_url: safeUrl }))
    .max(40)
    .default([]),
});
export type CompanyInput = z.infer<typeof CompanyInputSchema>;

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join('.');
    throw badRequest(first ? `${first.message}${path ? ` (${path})` : ''}` : 'Dados inválidos.');
  }
  return result.data;
}

export const uuidParam = z.string().uuid('Identificador inválido.');
