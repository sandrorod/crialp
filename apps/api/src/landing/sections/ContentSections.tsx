import type { RenderContext } from '../context.js';
import { SectionPhotos } from './SectionPhotos.js';
import { PhotoGrid } from './PhotoGrid.js';
import { TEMPLATES } from '../theme.js';
import { cad, ed, edIcon, edOptional } from '../context.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

export function AboutSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const about = ctx.content.about;
  if (!about) return null;
  const { company } = ctx;
  const facts: { icon: string; key: string; data: string; label: string; value: string }[] = [];
  if (company.segment) facts.push({ icon: 'briefcase', key: 'fact_specialty', data: 'fact.specialty', label: ctx.labels.fact_specialty, value: company.segment });
  if (company.city) facts.push({ icon: 'map-pin', key: 'fact_location', data: 'fact.location', label: ctx.labels.fact_location, value: [company.city, company.state].filter(Boolean).join(' – ') });
  if (company.opening_hours) facts.push({ icon: 'clock', key: 'fact_hours', data: 'contact.hours', label: ctx.labels.fact_hours, value: company.opening_hours });
  if (company.commercial_info?.target_audience) facts.push({ icon: 'users', key: 'fact_audience', data: 'fact.audience', label: ctx.labels.fact_audience, value: company.commercial_info.target_audience });

  return (
    <section id="sobre" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container about">
        <div className="about-text">
          {ctx.logo && ctx.theme.logoPlacement === 'about' ? (
            <img className="body-logo about-logo reveal" referrerPolicy="no-referrer" src={ctx.logo.url} alt={ctx.logo.alt} loading="lazy" />
          ) : null}
          <SectionHead eyebrow={ctx.labels.eyebrow_about} title={about.title} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_about'), title: ed(ctx, 'about.title') }} />
          <div className="reveal">
            {about.paragraphs.map((p, i) => (p ? <p key={i} {...ed(ctx, `about.paragraphs.${i}`)}>{p}</p> : null))}
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
                  <dt {...ed(ctx, `labels.${f.key}`)}>{f.label}</dt>
                  <dd {...cad(ctx, f.data, f.value).attrs}>{cad(ctx, f.data, f.value).text}</dd>
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
        <SectionHead eyebrow={ctx.labels.eyebrow_services} title={s.title} lead={s.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_services'), title: ed(ctx, 'services.title'), lead: edOptional(ctx, 'services.subtitle', 'Texto de apoio (opcional)') }} />
        {list ? (
          <div className="rows">
            {s.items.map((item, i) => (
              <article key={item.name} className="row reveal">
                <div className="row-lead">
                  <span className="row-icon"><Icon name={item.icon} size={22} attrs={edIcon(ctx, `services.items.${i}.icon`)} /></span>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 {...ed(ctx, `services.items.${i}.name`)}>{item.name}</h3>
                <div>
                  <p {...ed(ctx, `services.items.${i}.description`)}>{item.description}</p>
                  {item.benefit || ctx.editable ? (
                    <div className="benefit" {...(ctx.editable ? { 'data-lp-hide-empty': '' } : {})}>
                      <Icon name="check" size={18} stroke={2.2} />
                      <span {...edOptional(ctx, `services.items.${i}.benefit`, 'Benefício (opcional)')}>{item.benefit}</span>
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
                  <Icon name={item.icon} size={24} attrs={edIcon(ctx, `services.items.${i}.icon`)} />
                </div>
                <h3 {...ed(ctx, `services.items.${i}.name`)}>{item.name}</h3>
                <p {...ed(ctx, `services.items.${i}.description`)}>{item.description}</p>
                {item.benefit || ctx.editable ? (
                  <div className="benefit" {...(ctx.editable ? { 'data-lp-hide-empty': '' } : {})}>
                    <Icon name="check" size={18} stroke={2.2} />
                    <span {...edOptional(ctx, `services.items.${i}.benefit`, 'Benefício (opcional)')}>{item.benefit}</span>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
        <SectionPhotos ctx={ctx} name="services" />
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
        <SectionHead eyebrow={ctx.labels.eyebrow_differentials} title={d.title} lead={d.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_differentials'), title: ed(ctx, 'differentials.title'), lead: edOptional(ctx, 'differentials.subtitle', 'Texto de apoio (opcional)') }} />
        <div className="diff-grid reveal">
          {d.items.map((item, i) => (
            <div key={item.title} className="diff">
              <Icon name={item.icon} size={28} stroke={1.6} attrs={edIcon(ctx, `differentials.items.${i}.icon`)} />
              <h3 {...ed(ctx, `differentials.items.${i}.title`)}>{item.title}</h3>
              <p {...ed(ctx, `differentials.items.${i}.description`)}>{item.description}</p>
            </div>
          ))}
        </div>
        <SectionPhotos ctx={ctx} name="differentials" />
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
        <SectionHead eyebrow={ctx.labels.eyebrow_products} title={p.title} lead={p.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_products'), title: ed(ctx, 'products.title'), lead: edOptional(ctx, 'products.subtitle', 'Texto de apoio (opcional)') }} />
        <div className="grid">
          {p.items.map((item, i) => (
            <article key={item.name} className="card product reveal">
              <h3 {...ed(ctx, `products.items.${i}.name`)}>{item.name}</h3>
              <p {...ed(ctx, `products.items.${i}.description`)}>{item.description}</p>
              {item.features.some(Boolean) ? (
                <ul>
                  {item.features.slice(0, 6).map((f, j) =>
                    f ? (
                      <li key={`${j}-${f}`}>
                        <Icon name="check" size={16} stroke={2.2} />
                        <span {...ed(ctx, `products.items.${i}.features.${j}`)}>{f}</span>
                      </li>
                    ) : null,
                  )}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
        <SectionPhotos ctx={ctx} name="products" />
      </div>
    </section>
  );
}

/** Fotos visíveis na galeria; as demais aparecem com "Exibir mais". */
const GALLERY_VISIBLE = 9;

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function GalleryGrid({ photos, cols }: { photos: RenderContext['gallery']; cols?: number | null }) {
  return <PhotoGrid photos={photos} cols={cols} className="gallery" />;
}

export function GallerySection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const g = ctx.content.gallery;
  // ctx.gallery já exclui as fotos usadas no topo e em "sobre"
  const photos = ctx.gallery;
  if (!g || photos.length < 2) return null;
  // Com "Fotos por linha" escolhido, as fotos visíveis (e cada grupo do "Exibir mais") formam linhas completas:
  // o múltiplo de N mais próximo de 9 (2→10, 3→9, 4→8, 5→10)
  const cols = ctx.theme.photoCols;
  const visible = cols && cols >= 2 ? Math.max(cols, Math.round(GALLERY_VISIBLE / cols) * cols) : GALLERY_VISIBLE;
  return (
    <section id="galeria" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_gallery} title={g.title} lead={g.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_gallery'), title: ed(ctx, 'gallery.title'), lead: edOptional(ctx, 'gallery.subtitle', 'Texto de apoio (opcional)') }} />
        {/* g-nN: a grade se ajusta à quantidade de fotos para nunca sobrar buraco (ver styles.ts) */}
        <GalleryGrid photos={photos.slice(0, visible)} cols={ctx.theme.photoCols} />
        {/* No editor todas as fotos aparecem abertas, sem o botão "Exibir mais" */}
        {photos.length > visible && ctx.editable ? (
          <div className="gallery-more-panel gallery-more-open">
            {chunk(photos.slice(visible), visible).map((group) => (
              <GalleryGrid key={group[0].url} photos={group} cols={ctx.theme.photoCols} />
            ))}
          </div>
        ) : photos.length > visible ? (
          // Mais de 9 fotos: as demais ficam escondidas até clicar em "Exibir mais" (sem JavaScript),
          // em grades de até 9 para manter o mesmo arranjo de cada modelo
          <div className="gallery-more">
            <input type="checkbox" id="gallery-more" className="gallery-more-toggle" />
            <div className="gallery-more-panel">
              {chunk(photos.slice(visible), visible).map((group) => (
                <GalleryGrid key={group[0].url} photos={group} cols={ctx.theme.photoCols} />
              ))}
            </div>
            <div className="gallery-more-action">
              <label htmlFor="gallery-more" className="btn btn-ghost btn-sm gallery-more-btn">
                {ctx.labels.gallery_more}
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Depoimentos longos mostram os primeiros 250 caracteres com "Ler mais" / "Ler menos" (sem JavaScript). */
const QUOTE_LIMIT = 250;

function QuoteText({ ctx, id, text }: { ctx: RenderContext; id: string; text: string }) {
  const { attrs, text: full } = cad(ctx, `testimonial.${id}.text`, text);
  if (full.length <= QUOTE_LIMIT) return <p {...attrs}>{full}</p>;
  const cut = full.slice(0, QUOTE_LIMIT);
  const space = cut.lastIndexOf(' ');
  const short = (space > QUOTE_LIMIT * 0.75 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '');
  // Caixa de seleção escondida + rótulos: alterna resumo / texto inteiro sem JavaScript
  const toggle = `quote-more-${id}`;
  const more = (
    <div className="quote-more">
      <input type="checkbox" id={toggle} className="quote-more-toggle" />
      <p className="quote-more-short">
        {short}…{' '}
        <label htmlFor={toggle} className="quote-more-link">
          {ctx.labels.testimonial_more}
        </label>
      </p>
      <p className="quote-more-full">
        {full}{' '}
        <label htmlFor={toggle} className="quote-more-link">
          {ctx.labels.testimonial_less}
        </label>
      </p>
    </div>
  );
  // No editor: o resumo com "Ler mais" aparece como na página; no modo Textos, o texto inteiro para editar
  return ctx.editable ? (
    <>
      <p {...attrs} data-lp-ui="quote-edit">{full}</p>
      {more}
    </>
  ) : (
    more
  );
}

export function TestimonialsSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  // Os textos vêm exclusivamente do cadastro (depoimentos reais), nunca da IA.
  const items = ctx.company.testimonials;
  if (!items.length) return null;
  return (
    <section id="depoimentos" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_testimonials} title={ctx.content.testimonials?.title ?? 'O que dizem nossos clientes'} center paths={{ eyebrow: ed(ctx, 'labels.eyebrow_testimonials'), title: ed(ctx, 'testimonials.title') }} />
        <div className="quotes">
          {items.slice(0, 6).map((t) => (
            <blockquote key={t.id} className="quote reveal">
              <QuoteText ctx={ctx} id={t.id} text={t.text} />
              {t.author ? <footer {...cad(ctx, `testimonial.${t.id}.author`, t.author).attrs}>{cad(ctx, `testimonial.${t.id}.author`, t.author).text}</footer> : null}
            </blockquote>
          ))}
        </div>
        <SectionPhotos ctx={ctx} name="testimonials" />
      </div>
    </section>
  );
}

/** "G" colorido do Google, ao lado da nota. */
function GoogleMark() {
  return (
    <svg className="rv-g" viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const Stars = () => <span className="rv-stars" role="img" aria-label="5 de 5 estrelas">★★★★★</span>;

/** Mês e ano da avaliação ("março de 2026"). */
const reviewDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
};

/** Avaliações do Google: só as reais, 5 estrelas, buscadas ao gerar a página (nunca escritas pela IA). */
export function ReviewsSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const g = ctx.company.google_reviews;
  if (!g?.items.length) return null;
  return (
    <section id="avaliacoes" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        <SectionHead eyebrow={ctx.labels.eyebrow_reviews} title={ctx.labels.title_reviews} center paths={{ eyebrow: ed(ctx, 'labels.eyebrow_reviews'), title: ed(ctx, 'labels.title_reviews') }} />
        {g.rating != null ? (
          <p className="rv-summary reveal">
            <GoogleMark />
            <strong>{g.rating.toFixed(1).replace('.', ',')}</strong>
            <Stars />
            {g.total ? <span>{g.total.toLocaleString('pt-BR')} <span {...ed(ctx, 'labels.reviews_based')}>{ctx.labels.reviews_based}</span></span> : null}
          </p>
        ) : null}
        <div className="quotes">
          {g.items.map((r, i) => (
            <blockquote key={`${i}-${r.author}`} className="quote rv reveal">
              <Stars />
              <p>{r.text}</p>
              <footer className="rv-author">
                {r.photo ? <img src={r.photo} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" /> : <span className="rv-initial" aria-hidden="true">{r.author.charAt(0).toUpperCase()}</span>}
                <span>
                  <span className="rv-name">{r.author}</span>
                  {reviewDate(r.date) ? <small>{reviewDate(r.date)} · Google</small> : <small>Google</small>}
                </span>
              </footer>
            </blockquote>
          ))}
        </div>
        {g.url ? (
          <p className="rv-more">
            <a href={g.url} target="_blank" rel="noopener noreferrer" {...ed(ctx, 'labels.reviews_more')}>{ctx.labels.reviews_more}</a>
          </p>
        ) : null}
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
          {f.items.map((item, i) => !item.question ? null : (
            <details key={`${i}-${item.question}`}>
              <summary>
                <span {...ed(ctx, `faq.items.${i}.question`)}>{item.question}</span>
                <Icon name="plus" />
              </summary>
              <p {...ed(ctx, `faq.items.${i}.answer`)}>{item.answer}</p>
            </details>
          ))}
        </div>
        <SectionPhotos ctx={ctx} name="faq" />
      </div>
    </section>
  );
}
