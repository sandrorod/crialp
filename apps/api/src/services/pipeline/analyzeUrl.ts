import { AppError, Messages } from '../../lib/errors.js';
import { toBrazilE164Digits } from '../../lib/phone.js';
import { aiService, AIProviderError } from '../ai/index.js';
import type { ExtractedCompany } from '../ai/schemas.js';
import type { JobHandle } from '../jobs/JobService.js';
import { buildAnalysisDocument, ScraperService } from '../scraper/ScraperService.js';
import { isGoogleBusinessUrl, scrapeGoogleBusiness, scrapeGooglePlaceListing, type PlaceListing } from '../google/googleBusiness.js';
import { assembleImages } from './images.js';
import { SourceVerifier } from './verify.js';
import { toSourcePayload } from '../../repositories/sources.js';

/** Etapas exibidas na interface (1–6 análise; 7–9 geração). */
export const ANALYZE_STEPS = {
  access: 1,
  content: 2,
  identify: 3,
  contacts: 4,
  services: 5,
  commercial: 6,
} as const;

const scraper = new ScraperService();

export async function analyzeUrl(job: JobHandle, url: URL, opts: { allowImages?: boolean; place?: PlaceListing } = {}) {
  if (!(await aiService.isConfigured())) throw new AppError(503, Messages.aiNotConfigured);

  await job.step(ANALYZE_STEPS.access);
  // Link do Google (Maps / Perfil da Empresa): dados do perfil, mais o site próprio se o perfil tiver um
  // Local vindo de "Buscar empresas": os dados do Maps já vieram na pesquisa
  const google = opts.place
    ? await scrapeGooglePlaceListing(url, opts.place, scraper)
    : isGoogleBusinessUrl(url)
      ? await scrapeGoogleBusiness(url, scraper)
      : null;
  const scrape = google ? google.scrape : await scraper.scrape(url);

  await job.step(ANALYZE_STEPS.content);
  const totalText = scrape.pages.reduce((n, p) => n + p.text.length, 0);
  if (totalText < 150 && scrape.jsonLd.length === 0) {
    // Sites 100% renderizados via JavaScript ou protegidos contra robôs
    throw new AppError(422, Messages.insufficient, 'INSUFFICIENT_CONTENT');
  }
  const document = buildAnalysisDocument(scrape);

  await job.step(ANALYZE_STEPS.identify);
  let extracted: ExtractedCompany;
  try {
    extracted = await aiService.extractCompanyData(document);
  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error('[analyze] IA:', err.message);
      throw new AppError(502, err.userMessage ?? 'Não foi possível analisar as informações com a IA. Tente novamente.');
    }
    throw err;
  }

  await job.step(ANALYZE_STEPS.contacts);
  const v = new SourceVerifier(scrape);
  const c = extracted.contacts;
  let whatsapp = v.whatsapp(c.whatsapp);
  const mobile = v.phone(c.mobile, 'Celular');
  let phone = v.phone(c.phone);
  // Links wa.me do site são o WhatsApp oficial mesmo que a IA não o tenha apontado
  if (!whatsapp && scrape.found.whatsapps.length) whatsapp = formatDigits(scrape.found.whatsapps[0]);
  if (!phone && !mobile && scrape.found.phones.length === 1) phone = formatDigits(scrape.found.phones[0]);

  const contacts = {
    phone,
    mobile,
    whatsapp,
    email: v.email(c.email) ?? (scrape.found.emails.length === 1 ? scrape.found.emails[0] : null),
    address: v.address(c.address),
    number: v.number(c.number),
    neighborhood: v.phrase(c.neighborhood, 'Bairro'),
    city: v.phrase(c.city, 'Cidade'),
    state: v.state(c.state),
    zip_code: v.zip(c.zip_code),
  };
  const socials = {
    instagram: v.social('instagram', extracted.socials.instagram),
    facebook: v.social('facebook', extracted.socials.facebook),
    youtube: v.social('youtube', extracted.socials.youtube),
    linkedin: v.social('linkedin', extracted.socials.linkedin),
    tiktok: v.social('tiktok', extracted.socials.tiktok),
  };
  const knownSocialUrls = new Set(Object.values(socials).filter(Boolean));
  const other_socials = scrape.found.socials
    .filter((s) => !['instagram', 'facebook', 'youtube', 'linkedin', 'tiktok'].includes(s.network) && !knownSocialUrls.has(s.url))
    .map((s) => ({ network: s.network, url: s.url }));

  await job.step(ANALYZE_STEPS.services);
  const services = dedupeByName(extracted.services);
  const products = dedupeByName(extracted.products);

  await job.step(ANALYZE_STEPS.commercial);
  const testimonials = extracted.testimonials
    .filter((t) => v.testimonial(t.text))
    .map((t) => ({ author: t.author, text: t.text, source_url: scrape.finalUrl }));

  // Imagens só entram liberadas se o administrador declarou ter autorização de uso
  const images = assembleImages({
    scraped: scrape.images,
    classified: extracted.images,
    logoIndex: extracted.logo_index,
    allowUsage: !!opts.allowImages,
    companyName: extracted.trade_name || extracted.name,
  });

  const draft = {
    name: extracted.name,
    trade_name: extracted.trade_name,
    legal_name: v.phrase(extracted.legal_name, 'Razão social'),
    description: extracted.description,
    segment: extracted.segment,
    reference_url: url.toString(),
    website: google ? google.website : new URL(scrape.finalUrl).origin,
    opening_hours: extracted.opening_hours,
    ...contacts,
    ...socials,
    other_socials,
    commercial_info: extracted.commercial,
    services,
    products,
    images,
    testimonials,
  };

  return {
    // Conteúdo integral do site: não é enviado ao navegador; é salvo junto com a empresa
    raw: toSourcePayload(scrape),
    draft,
    design_preset: extracted.design_preset,
    meta: {
      final_url: scrape.finalUrl,
      pages: scrape.pages.map((p) => p.url),
      missing_info: google?.photoNote ? [...extracted.missing_info, google.photoNote] : extracted.missing_info,
      removed: v.removed,
      analyzed_at: new Date().toISOString(),
    },
  };
}

function formatDigits(d: string) {
  const n = toBrazilE164Digits(d);
  if (!n) return d;
  const local = n.slice(2);
  return local.length === 11
    ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
    : `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.name.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
