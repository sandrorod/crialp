import type { CompanyFull } from '../repositories/companies.js';
import type { LandingContent } from '../services/ai/schemas.js';
import { formatBrazilPhone, telLink, whatsappLink } from '../lib/phone.js';
import type { ResolvedTheme } from './theme.js';
import { blankSymbolOnlyDeep, stripEmojisDeep } from '../lib/emoji.js';
import { DEFAULT_LABELS, resolveLabels, type LabelKey, type Labels } from './labels.js';

export interface LpImage {
  url: string;
  alt: string;
  /** Enquadramento escolhido no editor (object-position e zoom); ausente = centralizado, sem zoom */
  style?: { objectPosition: string; transform?: string; transformOrigin?: string };
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
  /** Fotos escolhidas para cada seção personalizada (id da seção → fotos, na ordem do editor) */
  customPhotos: Record<string, LpImage[]>;
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
  /** Prévia do editor: marca os textos editáveis com data-lp-text (nunca na página pública). */
  editable?: boolean;
}

/**
 * Atributos que ligam um texto da página ao campo do conteúdo, para edição direto na prévia.
 * `orig`: texto que volta quando o campo é apagado (rótulo padrão ou dado do cadastro).
 */
export function ed(ctx: RenderContext, path: string, orig?: string): Record<string, string> {
  if (!ctx.editable) return {};
  const fallback = orig ?? (path.startsWith('labels.') ? DEFAULT_LABELS[path.slice(7) as LabelKey] : undefined);
  return fallback === undefined ? { 'data-lp-text': path } : { 'data-lp-text': path, 'data-lp-orig': fallback };
}

/** Ícone trocável na prévia (clique abre o seletor). `path` aponta para o campo "icon" do conteúdo. */
export function edIcon(ctx: RenderContext, path: string): Record<string, string> {
  return ctx.editable ? { 'data-lp-icon': path } : {};
}

/**
 * Campo opcional: na prévia continua clicável mesmo vazio (mostra `placeholder` no modo Textos)
 * e, ao ser apagado, vira de novo um espaço para escrever.
 */
export function edOptional(ctx: RenderContext, path: string, placeholder: string): Record<string, string> {
  return ctx.editable ? { 'data-lp-text': path, 'data-lp-empty': '', 'data-lp-placeholder': placeholder } : {};
}

/**
 * Texto que vem do cadastro da empresa (nome, contatos, depoimentos...) com a troca feita
 * só nesta Landing Page (content.overrides). Os links (tel:, WhatsApp, mapa) não mudam.
 */
export function cad(ctx: RenderContext, key: string, original: string): { text: string; attrs: Record<string, string> } {
  const custom = ctx.content.overrides?.[key]?.trim();
  return { text: custom || original, attrs: ed(ctx, `ov:${key}`, original) };
}

/** Só aceita URLs seguras para uso em href/src (evita javascript: e afins). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|mailto:|tel:)/i.test(url) || url.startsWith('/uploads/') || url.startsWith('#')) return url;
  return null;
}

export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'youtube', 'linkedin', 'tiktok'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Link da rede a partir do que foi digitado: URL completa, "instagram.com/empresa" ou só "@empresa". */
export function socialUrl(network: SocialNetwork, raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+\//.test(v) || /^(www\.)?[\w-]+\.(com|net|br)\b/i.test(v)) return `https://${v}`;
  const user = v.replace(/^@/, '');
  if (!/^[\w.-]+$/.test(user)) return null;
  const base: Record<SocialNetwork, string> = {
    instagram: `https://instagram.com/${user}`,
    facebook: `https://facebook.com/${user}`,
    youtube: `https://youtube.com/@${user}`,
    linkedin: `https://linkedin.com/company/${user}`,
    tiktok: `https://tiktok.com/@${user}`,
  };
  return base[network];
}

export function absoluteAsset(url: string, origin: string) {
  return url.startsWith('/') ? `${origin}${url}` : url;
}

const MAX_GALLERY = 9;

export function buildContext(opts: {
  company: CompanyFull;
  content: LandingContent;
  theme: ResolvedTheme;
  seo: { title?: string | null; description?: string | null; keywords?: string[] | null; ogImage?: string | null };
  pageUrl: string;
  editable?: boolean;
}): RenderContext {
  const { theme, pageUrl } = opts;
  // Opção "Remover emojis": todos os textos da página (conteúdo, cadastro e SEO) saem sem emoji
  const clean = theme.removeEmojis;
  const company = clean ? stripEmojisDeep(opts.company) : opts.company;
  // Textos que são só emoji/símbolo nunca aparecem sozinhos (ex.: ✓ seguido de um emoji, sem texto)
  const content = blankSymbolOnlyDeep(clean ? stripEmojisDeep(opts.content) : opts.content);
  opts = clean ? { ...opts, seo: stripEmojisDeep(opts.seo) } : opts;
  const displayName = company.trade_name || company.name;

  // Imagens só entram na página com permissão de uso confirmada pelo administrador.
  const allowed = company.images.filter((i) => i.usage_allowed && safeHref(i.url));
  // Foto escolhida como logotipo no editor tem prioridade sobre o logotipo do cadastro
  const logoImg = allowed.find((i) => theme.images[i.url] === 'logo') ?? allowed.find((i) => i.type === 'logo');
  // Ordem escolhida no editor; fotos que não estão na lista seguem a ordem da empresa
  const rank = new Map(theme.imageOrder.map((u, i) => [u, i]));
  const photos = allowed
    .filter((i) => i.type !== 'logo')
    .map((i, index) => ({ i, index }))
    .sort((a, b) => (rank.get(a.i.url) ?? theme.imageOrder.length + a.index) - (rank.get(b.i.url) ?? theme.imageOrder.length + b.index))
    .map(({ i }): LpImage => {
      const f = theme.focus[i.url];
      if (!f) return { url: i.url, alt: i.alt_text || displayName };
      const pos = `${f.x}% ${f.y}%`;
      // Zoom a partir do mesmo ponto: o recorte continua centrado onde o usuário escolheu
      const style = f.z && f.z > 1 ? { objectPosition: pos, transform: `scale(${f.z})`, transformOrigin: pos } : { objectPosition: pos };
      return { url: i.url, alt: i.alt_text || displayName, style };
    });
  // Local escolhido no editor; fotos sem escolha preenchem topo, "sobre" e galeria nessa ordem.
  // Foto de uma seção personalizada que foi excluída volta para o automático.
  const customIds = new Set((opts.content.custom_sections ?? []).map((s) => s.id));
  const place = (url: string) => {
    const p = theme.images[url];
    return p?.startsWith('custom:') && !customIds.has(p.slice(7)) ? undefined : p;
  };
  const visible = photos.filter((p) => place(p.url) !== 'hidden');
  const heroImage = visible.find((p) => place(p.url) === 'hero') ?? visible.find((p) => !place(p.url)) ?? null;
  const aboutImage =
    visible.find((p) => p !== heroImage && place(p.url) === 'about') ?? visible.find((p) => p !== heroImage && !place(p.url)) ?? null;
  // Galeria: até 9 fotos, como no editor (as demais aparecem lá em "Fora da página")
  const gallery = visible.filter((p) => p !== heroImage && p !== aboutImage && (place(p.url) === 'gallery' || !place(p.url))).slice(0, MAX_GALLERY);
  const customPhotos: Record<string, LpImage[]> = {};
  for (const p of visible) {
    const at = place(p.url);
    if (at?.startsWith('custom:')) (customPhotos[at.slice(7)] ??= []).push(p);
  }

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

  // Redes da página: as preenchidas no editor (content.overrides "social.<rede>") valem só nesta LP;
  // sem preenchimento, as do cadastro. Campo apagado no editor tira o ícone desta página.
  const social = (network: SocialNetwork, fromCompany: string | null) => {
    const own = content.overrides?.[`social.${network}`];
    return socialUrl(network, own !== undefined ? own : fromCompany);
  };
  const socials = [
    ...SOCIAL_NETWORKS.map((n) => [n, social(n, company[n])] as const),
    ...company.other_socials.map((s) => [s.network, s.url] as const),
  ]
    .filter(([, url]) => safeHref(url))
    .map(([network, url]) => ({ network: network as string, url: url as string }));

  const origin = new URL(pageUrl).origin;
  const ogImage = opts.seo.ogImage ?? heroImage?.url ?? logoImg?.url ?? null;

  // Logotipo na seção "Sobre" que não vai aparecer (sem texto ou desativada): vai para o início do conteúdo
  const aboutShown = !!content.about?.paragraphs.length && content.section_order.includes('about') && !(content.hidden_sections ?? []).includes('about');
  const logoTheme = theme.logoPlacement === 'about' && !aboutShown ? { ...theme, logoPlacement: 'hero' as const } : theme;

  return {
    editable: !!opts.editable,
    company,
    content,
    theme: logoTheme,
    labels,
    displayName,
    logo: logoImg ? { url: logoImg.url, alt: logoImg.alt_text || displayName } : null,
    heroImage,
    aboutImage,
    gallery,
    customPhotos,
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
