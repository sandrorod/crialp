import crypto from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SectionKey, SectionOrderKey } from '../services/ai/schemas.js';
import { CustomSectionView } from './sections/CustomSection.js';
import { finalCtaVars, sectionVars } from './sectionColors.js';
import { elementColorsCss, MOBILE_MAX } from './elementColors.js';
import { sectionSpacingCss } from './spacing.js';
import type { CSSProperties, ReactNode } from 'react';

/** Envolve a seção num contêiner que redefine as variáveis de cor (quando houver cores próprias). */
function Colored({ ctx, name, children }: { ctx: RenderContext; name: string; children: ReactNode }) {
  const colors = ctx.theme.sections[name];
  const vars = name === 'final_cta' ? finalCtaVars(ctx.theme, colors) : sectionVars(ctx.theme, colors);
  // Sempre há um contêiner: o editor o usa para arrastar seções e o celular para reordená-las
  return <div data-section={name} style={(vars ?? undefined) as CSSProperties | undefined}>{children}</div>;
}
import type { RenderContext } from './context.js';
import type { LabelKey } from './labels.js';
import { landingCss, REVEAL_SCRIPT } from './styles.js';
import { Header } from './sections/Header.js';
import { HeroSection } from './sections/HeroSection.js';
import {
  AboutSection,
  BenefitsSection,
  FaqSection,
  GallerySection,
  ProductsSection,
  ServicesSection,
  TestimonialsSection,
} from './sections/ContentSections.js';
import { ContactSection, FinalCTA, Footer, WhatsAppFloat } from './sections/ContactSection.js';

/** Hash do único script inline, usado na Content-Security-Policy das páginas públicas. */
export const REVEAL_SCRIPT_HASH = `'sha256-${crypto.createHash('sha256').update(REVEAL_SCRIPT).digest('base64')}'`;

const NAV_ITEMS: Partial<Record<SectionKey, [string, LabelKey]>> = {
  about: ['#sobre', 'nav_about'],
  services: ['#servicos', 'nav_services'],
  products: ['#produtos', 'nav_products'],
  differentials: ['#diferenciais', 'nav_differentials'],
  gallery: ['#galeria', 'nav_gallery'],
  faq: ['#duvidas', 'nav_faq'],
  contact: ['#contato', 'nav_contact'],
};

/** Decide quais seções existem de fato (sem dados → sem seção) e em qual ordem. */
export function resolveSections(ctx: RenderContext): SectionOrderKey[] {
  const c = ctx.content;
  const available: Record<SectionKey, boolean> = {
    about: !!c.about?.paragraphs.length,
    services: !!c.services?.items.length,
    differentials: !!c.differentials?.items.length,
    products: !!c.products?.items.length,
    gallery: !!c.gallery && ctx.gallery.length >= 2,
    testimonials: ctx.company.testimonials.length > 0,
    faq: !!c.faq?.items.length,
    contact: true,
    final_cta: true,
  };
  const customs = new Map((c.custom_sections ?? []).map((s) => [s.id, s]));
  const isAvailable = (k: SectionOrderKey) => {
    if (k.startsWith('custom:')) {
      const s = customs.get(k.slice(7));
      return !!s && !!(s.title || s.paragraphs.length || s.items.length);
    }
    return available[k as SectionKey];
  };
  const order = [...new Set(c.section_order)].filter(isAvailable);
  // Seções obrigatórias sempre presentes; depoimentos reais nunca são descartados
  for (const k of ['testimonials', 'contact', 'final_cta'] as SectionKey[]) {
    if (available[k] && !order.includes(k)) order.push(k);
  }
  // CTA final encerra a página; contato imediatamente antes
  const rest = order.filter((k) => k !== 'final_cta' && k !== 'contact');
  return [...rest, 'contact', 'final_cta'];
}

/**
 * Ordem própria do celular: sem mexer no HTML, o <main> vira coluna flex e cada seção
 * recebe "order". Topo primeiro; contato e CTA final continuam no fim.
 */
function mobileOrderCss(sections: SectionOrderKey[], mobileOrder: string[]): string {
  if (!mobileOrder.length) return '';
  const fixed = new Set<string>(['contact', 'final_cta']);
  const movable = sections.filter((k) => !fixed.has(k));
  const rank = new Map(mobileOrder.map((k, i) => [k, i]));
  const sorted = movable
    .map((k, i) => ({ k, r: rank.get(k) ?? mobileOrder.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.k);
  if (sorted.every((k, i) => k === movable[i])) return '';
  const rules = [...sorted, ...sections.filter((k) => fixed.has(k))].map((k, i) => `main>[data-section="${k}"]{order:${i + 1}}`).join('');
  return `@media(max-width:${MOBILE_MAX}px){main{display:flex;flex-direction:column}${rules}}`;
}

function jsonLd(ctx: RenderContext) {
  const c = ctx.company;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: ctx.displayName,
    url: ctx.pageUrl,
  };
  if (c.description) data.description = c.description;
  if (c.legal_name) data.legalName = c.legal_name;
  if (c.phone || c.mobile) data.telephone = c.phone || c.mobile;
  if (c.email) data.email = c.email;
  if (ctx.logo) data.logo = ctx.logo.url;
  if (ctx.seo.ogImage) data.image = ctx.seo.ogImage;
  if (c.city || c.address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: [c.address, c.number].filter(Boolean).join(', ') || undefined,
      addressLocality: c.city || undefined,
      addressRegion: c.state || undefined,
      postalCode: c.zip_code || undefined,
      addressCountry: 'BR',
    };
  }
  if (ctx.socials.length) data.sameAs = ctx.socials.map((s) => s.url);
  // Evita fechar a tag <script> dentro do JSON
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function renderLandingPage(ctx: RenderContext): string {
  const sections = resolveSections(ctx);
  const nav = sections
    .map((k) => NAV_ITEMS[k as SectionKey])
    .filter((n): n is [string, LabelKey] => !!n)
    .slice(0, 5)
    .map(([href, key]) => ({ href, label: ctx.labels[key], key }));

  // Alterna fundos para dar ritmo visual (a faixa de diferenciais e o CTA têm fundo próprio)
  let altToggle = false;
  const body = sections.map((key) => <Colored key={key} ctx={ctx} name={key}>{renderSection(key)}</Colored>);
  function renderSection(key: SectionOrderKey) {
    if (key === 'differentials') {
      altToggle = false;
      return <BenefitsSection key={key} ctx={ctx} />;
    }
    if (key === 'final_cta') return <FinalCTA key={key} ctx={ctx} />;
    altToggle = !altToggle;
    const alt = altToggle;
    if (key.startsWith('custom:')) {
      const section = ctx.content.custom_sections?.find((s) => s.id === key.slice(7));
      return section ? <CustomSectionView key={key} ctx={ctx} section={section} alt={alt} /> : null;
    }
    switch (key) {
      case 'about': return <AboutSection key={key} ctx={ctx} alt={alt} />;
      case 'services': return <ServicesSection key={key} ctx={ctx} alt={alt} />;
      case 'products': return <ProductsSection key={key} ctx={ctx} alt={alt} />;
      case 'gallery': return <GallerySection key={key} ctx={ctx} alt={alt} />;
      case 'testimonials': return <TestimonialsSection key={key} ctx={ctx} alt={alt} />;
      case 'faq': return <FaqSection key={key} ctx={ctx} alt={alt} />;
      case 'contact': return <ContactSection key={key} ctx={ctx} alt={alt} />;
      default: return null;
    }
  }

  const { seo, theme } = ctx;
  const page = (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        {seo.keywords.length ? <meta name="keywords" content={seo.keywords.join(', ')} /> : null}
        <link rel="canonical" href={ctx.pageUrl} />
        <meta name="theme-color" content={theme.vars['--bg']} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={ctx.pageUrl} />
        <meta property="og:site_name" content={ctx.displayName} />
        {seo.ogImage ? <meta property="og:image" content={seo.ogImage} /> : null}
        <meta name="twitter:card" content={seo.ogImage ? 'summary_large_image' : 'summary'} />
        {ctx.logo ? <link rel="icon" href={ctx.logo.url} /> : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={theme.fontsHref} />
        <style dangerouslySetInnerHTML={{ __html: landingCss(theme) }} />
        {ctx.editable ? (
          <style
            dangerouslySetInnerHTML={{
              __html: 'html:not(.lp-mode-textos) [data-lp-empty]:empty,html:not(.lp-mode-textos) [data-lp-hide-empty]:has([data-lp-empty]:empty){display:none!important}',
            }}
          />
        ) : null}
        <style id="lp-order" dangerouslySetInnerHTML={{ __html: mobileOrderCss(sections, theme.mobileOrder) }} />
        {/* O editor substitui este bloco ao vivo quando uma cor é escolhida na prévia */}
        <style id="lp-colors" dangerouslySetInnerHTML={{ __html: elementColorsCss(theme.elementColors) }} />
        <style id="lp-spacing" dangerouslySetInnerHTML={{ __html: sectionSpacingCss(theme.sectionSpacing) }} />
        <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ctx) }} />
      </head>
      <body className={`tpl-${theme.template}`}>
        <a className="skip" href="#conteudo">{ctx.labels.skip_link}</a>
        <Header ctx={ctx} nav={nav} />
        <main id="conteudo">
          <Colored ctx={ctx} name="hero"><HeroSection ctx={ctx} /></Colored>
          {body}
        </main>
        <Colored ctx={ctx} name="footer"><Footer ctx={ctx} /></Colored>
        <WhatsAppFloat ctx={ctx} />
      </body>
    </html>
  );
  return `<!doctype html>${renderToStaticMarkup(page)}`;
}

export function renderUnavailablePage(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Página indisponível</title><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f7f9;color:#1f2937;padding:24px;text-align:center}h1{font-size:22px;font-weight:600;margin:0 0 8px}p{margin:0;color:#6b7280}</style></head><body><main><h1>Esta página não está disponível.</h1><p>Tente novamente mais tarde.</p></main></body></html>`;
}
