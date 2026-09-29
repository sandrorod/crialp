import { AppError, Messages } from '../../lib/errors.js';
import { getCompanyFull, type CompanyFull } from '../../repositories/companies.js';
import { createLandingPage, getLandingPage, saveVersion } from '../../repositories/landingPages.js';
import { normalizeThemeSettings, type ThemeSettings } from '../../landing/theme.js';
import { refreshSnapshot } from '../../landing/publish.js';
import { aiService, AIProviderError } from '../ai/index.js';
import { SECTION_KEYS, type LandingContent, type SectionKey } from '../ai/schemas.js';
import type { JobHandle } from '../jobs/JobService.js';

export const GENERATE_STEPS = { structure: 7, generate: 8, save: 9 } as const;

/** Perfil enviado à IA: somente dados estruturados reais (sem IDs nem URLs internas). */
export function companyProfile(c: CompanyFull) {
  const allowedImages = c.images.filter((i) => i.usage_allowed);
  return {
    nome: c.trade_name || c.name,
    razao_social: c.legal_name,
    segmento: c.segment,
    descricao: c.description,
    contato: {
      telefone: c.phone,
      celular: c.mobile,
      whatsapp: c.whatsapp,
      email: c.email,
      endereco: [c.address, c.number].filter(Boolean).join(', ') || null,
      bairro: c.neighborhood,
      cidade: c.city,
      estado: c.state,
      cep: c.zip_code,
      site: c.website,
    },
    redes_sociais: [c.instagram, c.facebook, c.youtube, c.linkedin, c.tiktok, ...c.other_socials.map((s) => s.url)].filter(Boolean),
    horario_funcionamento: c.opening_hours,
    servicos: c.services.map((s) => ({ nome: s.name, descricao: s.description, beneficios: s.benefits, detalhes: s.details })),
    produtos: c.products.map((p) => ({ nome: p.name, descricao: p.description, caracteristicas: p.features, beneficios: p.benefits })),
    informacoes_comerciais: c.commercial_info,
    depoimentos_reais: c.testimonials.length,
    imagens_liberadas: {
      total: allowedImages.filter((i) => i.type !== 'logo').length,
      tipos: [...new Set(allowedImages.map((i) => i.type))],
      possui_logotipo: allowedImages.some((i) => i.type === 'logo'),
    },
  };
}

/** Remove qualquer seção que dependa de dados inexistentes, mesmo que a IA a tenha criado. */
function enforceFacts(content: Omit<LandingContent, 'section_order'> & { section_order: string[] }, c: CompanyFull): LandingContent {
  const photos = c.images.filter((i) => i.usage_allowed && i.type !== 'logo').length;
  const out = {
    ...content,
    testimonials: c.testimonials.length ? content.testimonials ?? { title: 'O que dizem nossos clientes' } : null,
    products: c.products.length ? content.products : null,
    gallery: photos >= 2 ? content.gallery : null,
    hero: { ...content.hero, highlights: content.hero.highlights.slice(0, 4) },
    services: content.services && content.services.items.length ? content.services : null,
    faq: content.faq && content.faq.items.length ? content.faq : null,
  };
  const section_order = [...new Set(content.section_order)].filter((k): k is SectionKey => SECTION_KEYS.includes(k as SectionKey));
  return { ...out, section_order };
}

function themeFromContent(content: LandingContent): ThemeSettings {
  return normalizeThemeSettings({
    preset: content.design.preset,
    primary: content.design.primary_color,
    accent: content.design.accent_color,
    heroVariant: content.design.hero_variant,
  });
}

export async function generateLanding(
  job: JobHandle,
  opts: { orgId: string; userId: string; companyId: string; landingPageId?: string; keepTheme?: boolean },
) {
  if (!(await aiService.isConfigured())) throw new AppError(503, Messages.aiNotConfigured);

  await job.step(GENERATE_STEPS.structure);
  const company = await getCompanyFull(opts.orgId, opts.companyId);
  if (!company) throw new AppError(404, 'Empresa não encontrada.');
  const existing = opts.landingPageId ? await getLandingPage(opts.orgId, opts.landingPageId) : null;
  if (opts.landingPageId && !existing) throw new AppError(404, 'Landing Page não encontrada.');

  await job.step(GENERATE_STEPS.generate);
  let generated: LandingContent;
  try {
    generated = await aiService.generateLandingContent(companyProfile(company), existing?.content ?? null);
  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error('[generate] IA:', err.message);
      throw new AppError(502, err.userMessage ?? Messages.aiFailed);
    }
    throw err;
  }
  const content = enforceFacts(generated, company);
  // Rótulos editados manualmente sobrevivem à regeneração
  if (existing?.content.labels) content.labels = existing.content.labels;
  // Textos do cadastro trocados na LP também
  if (existing?.content.overrides) content.overrides = existing.content.overrides;
  // Seções personalizadas também: voltam para antes do contato
  if (existing?.content.custom_sections?.length) {
    content.custom_sections = existing.content.custom_sections;
    const keys = existing.content.section_order.filter((k) => k.startsWith('custom:'));
    const at = content.section_order.indexOf('contact');
    content.section_order.splice(at >= 0 ? at : content.section_order.length, 0, ...keys);
  }
  const theme = existing && opts.keepTheme ? normalizeThemeSettings(existing.theme) : themeFromContent(content);
  const seo = {
    seo_title: content.seo.title.slice(0, 70),
    seo_description: content.seo.description.slice(0, 180),
    seo_keywords: content.seo.keywords.slice(0, 12),
    og_image: existing?.og_image ?? null,
  };

  await job.step(GENERATE_STEPS.save);
  let landingPageId: string;
  if (existing) {
    await saveVersion({ id: existing.id, orgId: opts.orgId, userId: opts.userId, content, theme, seo, note: 'Regenerada pela IA' });
    landingPageId = existing.id;
  } else {
    landingPageId = await createLandingPage({
      orgId: opts.orgId,
      companyId: company.id,
      userId: opts.userId,
      title: company.trade_name || company.name,
      content,
      theme,
      seo,
    });
  }
  const saved = await getLandingPage(opts.orgId, landingPageId);
  if (saved) await refreshSnapshot(saved);
  return { landingPageId };
}
