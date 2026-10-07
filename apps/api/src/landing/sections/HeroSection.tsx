import type { RenderContext } from '../context.js';
import { cad, ed, edOptional } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';

function Copy({ ctx }: { ctx: RenderContext }) {
  const { hero } = ctx.content;
  return (
    <>
      {ctx.logo && ctx.theme.logoPlacement === 'hero' ? (
        <img className="body-logo hero-logo reveal" referrerPolicy="no-referrer" src={ctx.logo.url} alt={ctx.logo.alt} />
      ) : null}
      {hero.eyebrow || ctx.editable ? <div className="eyebrow reveal" {...edOptional(ctx, 'hero.eyebrow', 'Linha de apoio (opcional)')}>{hero.eyebrow}</div> : null}
      <h1 className="reveal" {...ed(ctx, 'hero.headline')}>{hero.headline}</h1>
      <p className="sub reveal" {...ed(ctx, 'hero.subheadline')}>{hero.subheadline}</p>
      <div className="hero-actions reveal">
        <CtaButton ctx={ctx} label={hero.primary_cta} path="hero.primary_cta" />
        {hero.secondary_cta || ctx.editable ? (
          <a className="btn btn-ghost" href={ctx.content.services ? '#servicos' : '#contato'} {...(ctx.editable ? { 'data-lp-hide-empty': '' } : {})}>
            <span {...edOptional(ctx, 'hero.secondary_cta', 'Botão secundário (opcional)')}>{hero.secondary_cta}</span>
          </a>
        ) : null}
      </div>
      {/* Todos os destaques preenchidos (antes só os 4 primeiros apareciam) */}
      {hero.highlights.some((h) => h.trim()) ? (
        <ul className="highlights reveal">
          {hero.highlights.map((h, i) => (h.trim() ? (
            <li key={`${i}-${h}`}>
              <Icon name="check" size={18} stroke={2.2} />
              <span {...ed(ctx, `hero.highlights.${i}`)}>{h}</span>
            </li>
          ) : null))}
        </ul>
      ) : null}
    </>
  );
}

/** Painel com dados reais de atendimento, usado quando não há foto liberada. */
function InfoCard({ ctx }: { ctx: RenderContext }) {
  const { company, links } = ctx;
  // key: rótulo editável (labels.*); data: texto do cadastro editável só nesta LP (overrides)
  const items: { icon: string; key: string; data: string; label: string; value: string; href?: string | null }[] = [];
  if (company.opening_hours) items.push({ icon: 'clock', key: 'fact_hours', data: 'contact.hours', label: ctx.labels.fact_hours, value: company.opening_hours });
  if (links.phoneLabel) items.push({ icon: 'phone', key: 'contact_phone', data: 'contact.phone', label: ctx.labels.contact_phone, value: links.phoneLabel, href: links.phone });
  if (company.city) items.push({ icon: 'map-pin', key: 'fact_location', data: 'card.location', label: ctx.labels.fact_location, value: [company.neighborhood, [company.city, company.state].filter(Boolean).join(' – ')].filter(Boolean).join(', '), href: links.map });
  if (company.email && items.length < 3) items.push({ icon: 'mail', key: 'contact_email', data: 'contact.email', label: ctx.labels.contact_email, value: company.email, href: links.email });
  if (!items.length && company.segment) items.push({ icon: 'briefcase', key: 'fact_specialty', data: 'fact.specialty', label: ctx.labels.fact_specialty, value: company.segment });
  const name = cad(ctx, 'company.name', ctx.displayName);

  return (
    <aside className="hero-card reveal">
      <h3 {...name.attrs}>{name.text}</h3>
      <ul>
        {items.map((i) => {
          const v = cad(ctx, i.data, i.value);
          return (
          <li key={i.label}>
            <Icon name={i.icon} />
            <div>
              <small {...ed(ctx, `labels.${i.key}`)}>{i.label}</small>
              {i.href ? (
                <a href={i.href} {...(i.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>
                  <span {...v.attrs}>{v.text}</span>
                </a>
              ) : (
                <span {...v.attrs}>{v.text}</span>
              )}
            </div>
          </li>
          );
        })}
      </ul>
      <CtaButton ctx={ctx} label={ctx.content.final_cta.cta} path="final_cta.cta" />
    </aside>
  );
}

export function HeroSection({ ctx }: { ctx: RenderContext }) {
  const variant = ctx.theme.heroVariant;

  if (variant === 'centered') {
    return (
      <section id="inicio" className="hero hero-centered">
        <div className="hero-pattern" />
        <div className="container">
          <Copy ctx={ctx} />
        </div>
      </section>
    );
  }

  return (
    <section id="inicio" className="hero hero-split">
      <div className="container">
        <div>
          <Copy ctx={ctx} />
        </div>
        {ctx.heroImage ? (
          <div className="hero-media reveal">
            <img referrerPolicy="no-referrer" src={ctx.heroImage.url} alt={ctx.heroImage.alt} fetchPriority="high" data-lp-img={ctx.heroImage.url} style={ctx.heroImage.style} />
          </div>
        ) : (
          <InfoCard ctx={ctx} />
        )}
      </div>
    </section>
  );
}
