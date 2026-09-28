import type { CompanyFull } from '../repositories/companies.js';
import type { LandingContent } from '../services/ai/schemas.js';
import { formatBrazilPhone, telLink, whatsappLink } from '../lib/phone.js';
import type { ResolvedTheme } from './theme.js';
import { resolveLabels, type Labels } from './labels.js';

export interface LpImage {
  url: string;
  alt: string;
  /** object-position escolhido no editor (ex.: "30% 60%"); ausente = centro */
  position?: string;
}

export interface RenderContext {
  company: CompanyFull;
  content: LandingContent;
  theme: ResolvedTheme;
  labels: Labels;
  displayName: string;
  logo: LpImage | null;
  heroImage: LpImage | null;
  aboutImage: LpImage | null;
  gallery: LpImage[];
  links: {
    whatsapp: string | null;
    phone: string | null;
    phoneLabel: string | null;
    email: string | null;
    map: string | null;
    primary: string;
    primaryIsExternal: boolean;
  };
  addressLine: string | null;
  socials: { network: string; url: string }[];
  pageUrl: string;
  seo: { title: string; description: string; keywords: string[]; ogImage: string | null };
}

/** Só aceita URLs seguras para uso em href/src (evita javascript: e afins). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|mailto:|tel:)/i.test(url) || url.startsWith('/uploads/') || url.startsWith('#')) return url;
  return null;
}

export function absoluteAsset(url: string, origin: string) {
  return url.startsWith('/') ? `${origin}${url}` : url;
}

export function buildContext(opts: {
  company: CompanyFull;
  content: LandingContent;
  theme: ResolvedTheme;
  seo: { title?: string | null; description?: string | null; keywords?: string[] | null; ogImage?: string | null };
  pageUrl: string;
}): RenderContext {
  const { company, content, theme, pageUrl } = opts;
  const displayName = company.trade_name || company.name;

  // Imagens só entram na página com permissão de uso confirmada pelo administrador.
  const allowed = company.images.filter((i) => i.usage_allowed && safeHref(i.url));
  const logoImg = allowed.find((i) => i.type === 'logo');
  // Ordem escolhida no editor; fotos que não estão na lista seguem a ordem da empresa
  const rank = new Map(theme.imageOrder.map((u, i) => [u, i]));
  const photos = allowed
    .filter((i) => i.type !== 'logo')
    .map((i, index) => ({ i, index }))
    .sort((a, b) => (rank.get(a.i.url) ?? theme.imageOrder.length + a.index) - (rank.get(b.i.url) ?? theme.imageOrder.length + b.index))
    .map(({ i }): LpImage => {
      const f = theme.focus[i.url];
      return { url: i.url, alt: i.alt_text || displayName, ...(f ? { position: `${f.x}% ${f.y}%` } : {}) };
    });
  // Local escolhido no editor; fotos sem escolha preenchem topo, "sobre" e galeria nessa ordem
  const place = (url: string) => theme.images[url];
  const visible = photos.filter((p) => place(p.url) !== 'hidden');
  const heroImage = visible.find((p) => place(p.url) === 'hero') ?? visible.find((p) => !place(p.url)) ?? null;
  const aboutImage =
    visible.find((p) => p !== heroImage && place(p.url) === 'about') ?? visible.find((p) => p !== heroImage && !place(p.url)) ?? null;
  const gallery = visible.filter((p) => p !== heroImage && p !== aboutImage && (place(p.url) === 'gallery' || !place(p.url)));

  const labels = resolveLabels((content as { labels?: unknown }).labels);
  const waMessage = labels.whatsapp_message.replaceAll('{empresa}', displayName);
  const whatsapp = whatsappLink(company.whatsapp, company.mobile, waMessage);
  const phoneSource = company.phone || company.mobile || company.whatsapp;
  const phone = telLink(phoneSource);
  const email = company.email ? `mailto:${company.email}` : null;

  const addressParts = [
    [company.address, company.number].filter(Boolean).join(', '),
    company.neighborhood,
    [company.city, company.state].filter(Boolean).join(' – '),
    company.zip_code ? `CEP ${company.zip_code}` : null,
  ].filter((p) => p && p.trim());
  const addressLine = addressParts.length ? addressParts.join(' · ') : null;
  const map =
    company.address || company.city
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [displayName, company.address, company.number, company.neighborhood, company.city, company.state].filter(Boolean).join(', '),
        )}`
      : null;

  const primary = whatsapp ?? phone ?? email ?? '#contato';

  const socials = [
    ['instagram', company.instagram],
    ['facebook', company.facebook],
    ['youtube', company.youtube],
    ['linkedin', company.linkedin],
    ['tiktok', company.tiktok],
    ...company.other_socials.map((s) => [s.network, s.url] as const),
  ]
    .filter(([, url]) => safeHref(url))
    .map(([network, url]) => ({ network: network as string, url: url as string }));

  const origin = new URL(pageUrl).origin;
  const ogImage = opts.seo.ogImage ?? heroImage?.url ?? logoImg?.url ?? null;

  return {
    company,
    content,
    theme,
    labels,
    displayName,
    logo: logoImg ? { url: logoImg.url, alt: logoImg.alt_text || displayName } : null,
    heroImage,
    aboutImage,
    gallery,
    links: {
      whatsapp,
      phone,
      phoneLabel: phoneSource ? formatBrazilPhone(phoneSource) : null,
      email,
      map,
      primary,
      primaryIsExternal: primary.startsWith('http'),
    },
    addressLine,
    socials,
    pageUrl,
    seo: {
      title: opts.seo.title || content.seo.title || displayName,
      description: opts.seo.description || content.seo.description || company.description || '',
      keywords: opts.seo.keywords?.length ? opts.seo.keywords : content.seo.keywords,
      ogImage: ogImage ? absoluteAsset(ogImage, origin) : null,
    },
  };
}
