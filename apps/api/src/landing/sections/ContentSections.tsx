import type { RenderContext } from '../context.js';
import { TEMPLATES } from '../theme.js';
import { ed } from '../context.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

export function AboutSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const about = ctx.content.about;
  if (!about) return null;
  const { company } = ctx;
  const facts: { icon: string; label: string; value: string }[] = [];
  if (company.segment) facts.push({ icon: 'briefcase', label: ctx.labels.fact_specialty, value: company.segment });
  if (company.city) facts.push({ icon: 'map-pin', label: ctx.labels.fact_location, value: [company.city, company.state].filter(Boolean).join(' – ') });
  if (company.opening_hours) facts.push({ icon: 'clock', label: ctx.labels.fact_hours, value: company.opening_hours });
  if (company.commercial_info?.target_audience) facts.push({ icon: 'users', label: ctx.labels.fact_audience, value: company.commercial_info.target_audience });

  return (
    <section id="sobre" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container about">
        <div className="about-text">
          <SectionHead eyebrow={ctx.labels.eyebrow_about} title={about.title} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_about'), title: ed(ctx, 'about.title') }} />
          <div className="reveal">
            {about.paragraphs.map((p, i) => (
              <p key={i} {...ed(ctx, `about.paragraphs.${i}`)}>{p}</p>
            ))}
          </div>
        </div>
        {ctx.aboutImage ? (
          <div className="about-media reveal">
            <img referrerPolicy="no-referrer" src={ctx.aboutImage.url} alt={ctx.aboutImage.alt} loading="lazy" decoding="async" data-lp-img={ctx.aboutImage.url} style={ctx.aboutImage.style} />
          </div>
        ) : facts.length ? (
          <dl className="facts reveal">
            {facts.map((f) => (
              <div key={f.label}>
                <Icon name={f.icon} />
                <span>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </span>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

export function ServicesSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const s = ctx.content.services;
  if (!s || !s.items.length) return null;
  const list = (TEMPLATES[ctx.theme.template].services(s.items.length) ?? ctx.theme.p.servicesLayout) === 'list';
  return (
    <section id="servicos" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_services} title={s.title} lead={s.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_services'), title: ed(ctx, 'services.title'), lead: ed(ctx, 'services.subtitle') }} />
        {list ? (
          <div className="rows">
            {s.items.map((item, i) => (
              <article key={item.name} className="row reveal">
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <h3 {...ed(ctx, `services.items.${i}.name`)}>{item.name}</h3>
                <div>
                  <p {...ed(ctx, `services.items.${i}.description`)}>{item.description}</p>
                  {item.benefit ? (
                    <div className="benefit">
                      <Icon name="check" size={18} stroke={2.2} />
                      <span {...ed(ctx, `services.items.${i}.benefit`)}>{item.benefit}</span>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid">
            {s.items.map((item, i) => (
              <article key={item.name} className="card reveal">
                <div className="icon-box">
                  <Icon name={item.icon} size={24} />
                </div>
                <h3 {...ed(ctx, `services.items.${i}.name`)}>{item.name}</h3>
                <p {...ed(ctx, `services.items.${i}.description`)}>{item.description}</p>
                {item.benefit ? (
                  <div className="benefit">
                    <Icon name="check" size={18} stroke={2.2} />
                    <span {...ed(ctx, `services.items.${i}.benefit`)}>{item.benefit}</span>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function BenefitsSection({ ctx }: { ctx: RenderContext }) {
  const d = ctx.content.differentials;
  if (!d || !d.items.length) return null;
  return (
    <section id="diferenciais" className="section band">
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_differentials} title={d.title} lead={d.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_differentials'), title: ed(ctx, 'differentials.title'), lead: ed(ctx, 'differentials.subtitle') }} />
        <div className="diff-grid reveal">
          {d.items.map((item, i) => (
            <div key={item.title} className="diff">
              <Icon name={item.icon} size={28} stroke={1.6} />
              <h3 {...ed(ctx, `differentials.items.${i}.title`)}>{item.title}</h3>
              <p {...ed(ctx, `differentials.items.${i}.description`)}>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductsSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const p = ctx.content.products;
  if (!p || !p.items.length) return null;
  return (
    <section id="produtos" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_products} title={p.title} lead={p.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_products'), title: ed(ctx, 'products.title'), lead: ed(ctx, 'products.subtitle') }} />
        <div className="grid">
          {p.items.map((item, i) => (
            <article key={item.name} className="card product reveal">
              <h3 {...ed(ctx, `products.items.${i}.name`)}>{item.name}</h3>
              <p {...ed(ctx, `products.items.${i}.description`)}>{item.description}</p>
              {item.features.length ? (
                <ul>
                  {item.features.slice(0, 6).map((f, j) => (
                    <li key={f}>
                      <Icon name="check" size={16} stroke={2.2} />
                      <span {...ed(ctx, `products.items.${i}.features.${j}`)}>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GallerySection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const g = ctx.content.gallery;
  // ctx.gallery já exclui as fotos usadas no topo e em "sobre"
  const photos = ctx.gallery;
  if (!g || photos.length < 2) return null;
  return (
    <section id="galeria" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_gallery} title={g.title} lead={g.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_gallery'), title: ed(ctx, 'gallery.title'), lead: ed(ctx, 'gallery.subtitle') }} />
        <div className="gallery">
          {photos.slice(0, 9).map((img) => (
            <figure key={img.url} className="reveal">
              <img referrerPolicy="no-referrer" src={img.url} alt={img.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TestimonialsSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  // Os textos vêm exclusivamente do cadastro (depoimentos reais), nunca da IA.
  const items = ctx.company.testimonials;
  if (!items.length) return null;
  return (
    <section id="depoimentos" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_testimonials} title={ctx.content.testimonials?.title ?? 'O que dizem nossos clientes'} center paths={{ eyebrow: ed(ctx, 'labels.eyebrow_testimonials'), title: ctx.content.testimonials ? ed(ctx, 'testimonials.title') : {} }} />
        <div className="quotes">
          {items.slice(0, 6).map((t) => (
            <blockquote key={t.id} className="quote reveal">
              <p>{t.text}</p>
              {t.author ? <footer>{t.author}</footer> : null}
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const f = ctx.content.faq;
  if (!f || !f.items.length) return null;
  return (
    <section id="duvidas" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_faq} title={f.title} center paths={{ eyebrow: ed(ctx, 'labels.eyebrow_faq'), title: ed(ctx, 'faq.title') }} />
        <div className="faq reveal">
          {f.items.map((item, i) => (
            <details key={item.question}>
              <summary>
                <span {...ed(ctx, `faq.items.${i}.question`)}>{item.question}</span>
                <Icon name="plus" />
              </summary>
              <p {...ed(ctx, `faq.items.${i}.answer`)}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
