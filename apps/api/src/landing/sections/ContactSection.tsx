import type { RenderContext } from '../context.js';
import { formatBrazilPhone } from '../../lib/phone.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

const SOCIAL_ICON: Record<string, string> = {
  instagram: 'instagram', facebook: 'facebook', youtube: 'youtube', linkedin: 'linkedin', tiktok: 'tiktok',
};

export function ContactSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const { company, links } = ctx;
  const items: { icon: string; label: string; value: string; href?: string | null }[] = [];
  if (links.whatsapp) items.push({ icon: 'message', label: ctx.labels.contact_whatsapp, value: formatBrazilPhone(company.whatsapp || company.mobile), href: links.whatsapp });
  if (links.phoneLabel && links.phone) items.push({ icon: 'phone', label: ctx.labels.contact_phone, value: links.phoneLabel, href: links.phone });
  if (company.email) items.push({ icon: 'mail', label: ctx.labels.contact_email, value: company.email, href: links.email });
  if (ctx.addressLine) items.push({ icon: 'map-pin', label: ctx.labels.contact_address, value: ctx.addressLine, href: links.map });
  if (company.opening_hours) items.push({ icon: 'clock', label: ctx.labels.contact_hours, value: company.opening_hours });
  if (!items.length && !ctx.socials.length) return null;

  return (
    <section id="contato" className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container contact">
        <div>
          <SectionHead eyebrow={ctx.labels.eyebrow_contact} title={ctx.content.contact.title} lead={ctx.content.contact.subtitle} />
          <div className="reveal">
            <CtaButton ctx={ctx} label={ctx.content.final_cta.cta} />
          </div>
          {ctx.socials.length ? (
            <div className="socials reveal">
              {ctx.socials.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener" aria-label={s.network}>
                  <Icon name={SOCIAL_ICON[s.network.toLowerCase()] ?? 'globe'} size={20} />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <ul className="contact-list reveal">
          {items.map((i) => {
            const inner = (
              <>
                <Icon name={i.icon} />
                <span>
                  <small>{i.label}</small>
                  <strong>{i.value}</strong>
                </span>
              </>
            );
            return (
              <li key={i.label}>
                {i.href ? (
                  <a href={i.href} {...(i.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>
                    {inner}
                  </a>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function FinalCTA({ ctx }: { ctx: RenderContext }) {
  const f = ctx.content.final_cta;
  return (
    <section className="section final">
      <div className="container">
        <h2 className="reveal">{f.title}</h2>
        {f.subtitle ? <p className="reveal">{f.subtitle}</p> : null}
        <div className="reveal">
          <CtaButton ctx={ctx} label={f.cta} />
        </div>
      </div>
    </section>
  );
}

export function Footer({ ctx }: { ctx: RenderContext }) {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <span>
          © {year} {ctx.displayName}
          {ctx.company.legal_name && ctx.company.legal_name !== ctx.displayName ? ` · ${ctx.company.legal_name}` : ''}
        </span>
        {ctx.labels.footer_note ? <span>{ctx.labels.footer_note}</span> : ctx.addressLine ? <span>{ctx.addressLine}</span> : null}
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
