import type { RenderContext } from '../context.js';
import { SectionPhotos } from './SectionPhotos.js';
import { formatBrazilPhone } from '../../lib/phone.js';
import { cad, ed, edOptional } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

const SOCIAL_ICON: Record<string, string> = {
  instagram: 'instagram', facebook: 'facebook', youtube: 'youtube', linkedin: 'linkedin', tiktok: 'tiktok',
};

export function ContactSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const { company, links } = ctx;
  const items: { label: string; value: string; href?: string | null; key: string; data: string; tel?: boolean }[] = [];
  if (links.whatsapp) items.push({ key: 'contact_whatsapp', data: 'contact.whatsapp', label: ctx.labels.contact_whatsapp, value: formatBrazilPhone(company.whatsapp || company.mobile), href: links.whatsapp, tel: true });
  if (links.phoneLabel && links.phone) items.push({ key: 'contact_phone', data: 'contact.phone', label: ctx.labels.contact_phone, value: links.phoneLabel, href: links.phone, tel: true });
  if (company.email) items.push({ key: 'contact_email', data: 'contact.email', label: ctx.labels.contact_email, value: company.email, href: links.email });
  if (ctx.addressLine) items.push({ key: 'contact_address', data: 'contact.address', label: ctx.labels.contact_address, value: ctx.addressLine, href: links.map });
  if (company.opening_hours) items.push({ key: 'contact_hours', data: 'contact.hours', label: ctx.labels.contact_hours, value: company.opening_hours });
  if (!items.length && !ctx.socials.length) return null;

  // Cartão com título, botão e linhas "rótulo | valor"; mapa ao lado, da mesma altura
  return (
    <section id="contato" className={`section${alt ? ' section-alt' : ''}`}>
      <div className={`container contact${ctx.mapEmbed ? ' has-map' : ''}`}>
        <div className="contact-card">
          <SectionHead eyebrow={ctx.labels.eyebrow_contact} title={ctx.content.contact.title} lead={ctx.content.contact.subtitle} paths={{ eyebrow: ed(ctx, 'labels.eyebrow_contact'), title: ed(ctx, 'contact.title'), lead: edOptional(ctx, 'contact.subtitle', 'Texto de apoio (opcional)') }} />
          {/* Botão e redes sociais na mesma linha (descem só se não couberem) */}
          <div className={`contact-actions reveal sn-${Math.min(ctx.socials.length, 8)}`}>
            <CtaButton ctx={ctx} label={ctx.content.final_cta.cta} path="final_cta.cta" />
            {ctx.socials.length ? (
              <div className="socials">
                {ctx.socials.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener" aria-label={s.network}>
                    <Icon name={SOCIAL_ICON[s.network.toLowerCase()] ?? 'globe'} size={26} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          {!ctx.socials.length && ctx.editable ? (
            // Só na prévia do editor: indica onde preencher as redes (a página publicada não mostra nada)
            <p className="lp-social-hint">+ Redes sociais: preencha em Textos → “Redes sociais”</p>
          ) : null}
          {items.length ? (
            <dl className="contact-rows reveal">
              {items.map((i) => {
                const v = cad(ctx, i.data, i.value);
                // Vários números ficam numa linha só, separados por " · "
                const text = i.tel ? v.text.split(/\s*\n+\s*/).filter(Boolean).join(' · ') : v.text;
                const value = <span {...v.attrs}>{text}</span>;
                return (
                  <div key={i.key} className={i.tel ? 'contact-row is-tel' : 'contact-row'}>
                    <dt {...ed(ctx, `labels.${i.key}`)}>{i.label}</dt>
                    <dd>
                      {i.href ? (
                        <a href={i.href} {...(i.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>{value}</a>
                      ) : value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
        </div>
        {ctx.mapEmbed ? (
          <div className="contact-map reveal">
            <iframe src={ctx.mapEmbed} title={`Mapa: ${ctx.addressLine ?? ctx.displayName}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
          </div>
        ) : null}
        <SectionPhotos ctx={ctx} name="contact" />
      </div>
    </section>
  );
}

export function FinalCTA({ ctx }: { ctx: RenderContext }) {
  const f = ctx.content.final_cta;
  return (
    <section className="section final">
      <div className="container">
        <h2 className="reveal" {...ed(ctx, 'final_cta.title')}>{f.title}</h2>
        {f.subtitle || ctx.editable ? <p className="reveal" {...edOptional(ctx, 'final_cta.subtitle', 'Texto de apoio (opcional)')}>{f.subtitle}</p> : null}
        <div className="reveal">
          <CtaButton ctx={ctx} label={f.cta} path="final_cta.cta" />
        </div>
        <SectionPhotos ctx={ctx} name="final_cta" />
      </div>
    </section>
  );
}

export function Footer({ ctx }: { ctx: RenderContext }) {
  const year = new Date().getFullYear();
  const copyright = cad(
    ctx,
    'footer.copyright',
    `© ${year} ${ctx.displayName}${ctx.company.legal_name && ctx.company.legal_name !== ctx.displayName ? ` · ${ctx.company.legal_name}` : ''}`,
  );
  // Observação do rodapé; sem ela aparece o endereço (apagar a observação volta ao endereço)
  const note = ctx.labels.footer_note || ctx.addressLine;
  return (
    <footer className="site-footer">
      <div className="container">
        <span {...copyright.attrs}>{copyright.text}</span>
        {note || ctx.editable ? (
          <span {...(ctx.editable ? { ...edOptional(ctx, 'labels.footer_note', 'Observação do rodapé (opcional)'), ...(ctx.addressLine ? { 'data-lp-orig': ctx.addressLine } : {}) } : {})}>{note}</span>
        ) : null}
      </div>
    </footer>
  );
}

export function WhatsAppFloat({ ctx }: { ctx: RenderContext }) {
  if (!ctx.links.whatsapp) return null;
  return (
    <a className="wa-float" href={ctx.links.whatsapp} target="_blank" rel="noopener" aria-label={ctx.labels.whatsapp_float} title={ctx.labels.whatsapp_float}>
      <Icon name="message" size={28} stroke={2} />
    </a>
  );
}
