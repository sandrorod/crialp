import type { RenderContext } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';

function Copy({ ctx }: { ctx: RenderContext }) {
  const { hero } = ctx.content;
  return (
    <>
      {hero.eyebrow ? <div className="eyebrow reveal">{hero.eyebrow}</div> : null}
      <h1 className="reveal">{hero.headline}</h1>
      <p className="sub reveal">{hero.subheadline}</p>
      <div className="hero-actions reveal">
        <CtaButton ctx={ctx} label={hero.primary_cta} />
        {hero.secondary_cta ? (
          <a className="btn btn-ghost" href={ctx.content.services ? '#servicos' : '#contato'}>
            {hero.secondary_cta}
          </a>
        ) : null}
      </div>
      {hero.highlights.length ? (
        <ul className="highlights reveal">
          {hero.highlights.slice(0, 4).map((h) => (
            <li key={h}>
              <Icon name="check" size={18} stroke={2.2} />
              {h}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Painel com dados reais de atendimento, usado quando não há foto liberada. */
function InfoCard({ ctx }: { ctx: RenderContext }) {
  const { company, links } = ctx;
  const items: { icon: string; label: string; value: string; href?: string | null }[] = [];
  if (company.opening_hours) items.push({ icon: 'clock', label: ctx.labels.fact_hours, value: company.opening_hours });
  if (links.phoneLabel) items.push({ icon: 'phone', label: ctx.labels.contact_phone, value: links.phoneLabel, href: links.phone });
  if (company.city) items.push({ icon: 'map-pin', label: ctx.labels.fact_location, value: [company.neighborhood, [company.city, company.state].filter(Boolean).join(' – ')].filter(Boolean).join(', '), href: links.map });
  if (company.email && items.length < 3) items.push({ icon: 'mail', label: ctx.labels.contact_email, value: company.email, href: links.email });
  if (!items.length && company.segment) items.push({ icon: 'briefcase', label: ctx.labels.fact_specialty, value: company.segment });

  return (
    <aside className="hero-card reveal">
      <h3>{ctx.displayName}</h3>
      <ul>
        {items.map((i) => (
          <li key={i.label}>
            <Icon name={i.icon} />
            <div>
              <small>{i.label}</small>
              {i.href ? (
                <a href={i.href} {...(i.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>
                  {i.value}
                </a>
              ) : (
                <span>{i.value}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <CtaButton ctx={ctx} label={ctx.content.final_cta.cta} />
    </aside>
  );
}

export function HeroSection({ ctx }: { ctx: RenderContext }) {
  const variant = ctx.theme.heroVariant === 'image' && !ctx.heroImage ? 'centered' : ctx.theme.heroVariant;

  if (variant === 'image' && ctx.heroImage) {
    return (
      <section id="inicio" className="hero hero-image">
        <div className="bg">
          <img referrerPolicy="no-referrer" src={ctx.heroImage.url} alt={ctx.heroImage.alt} fetchPriority="high" data-lp-img={ctx.heroImage.url} style={ctx.heroImage.position ? { objectPosition: ctx.heroImage.position } : undefined} />
        </div>
        <div className="container">
          <Copy ctx={ctx} />
        </div>
      </section>
    );
  }

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
            <img referrerPolicy="no-referrer" src={ctx.heroImage.url} alt={ctx.heroImage.alt} fetchPriority="high" data-lp-img={ctx.heroImage.url} style={ctx.heroImage.position ? { objectPosition: ctx.heroImage.position } : undefined} />
          </div>
        ) : (
          <InfoCard ctx={ctx} />
        )}
      </div>
    </section>
  );
}
