import type { CustomSection, SectionBlock } from '../../services/ai/schemas.js';
import { ed, edIcon, edOptional, safeHref, type RenderContext } from '../context.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

/** Seção livre criada pelo administrador (textos do site ou conteúdo próprio). */
export function CustomSectionView({ ctx, section, alt }: { ctx: RenderContext; section: CustomSection; alt: boolean }) {
  const base = `custom.${section.id}`;
  // Páginas salvas antes dos elementos não têm "blocks" nem "align"
  const blocks = section.blocks ?? [];
  const center = section.align === 'center';
  // Fotos escolhidas para esta seção na aba "Fotos" (mesma grade da galeria do modelo)
  const photos = ctx.customPhotos[section.id] ?? [];
  return (
    <section id={`sec-${section.id}`} className={`section${alt ? ' section-alt' : ''}${center ? ' custom-center' : ''}`}>
      <div className="container">
        {section.title ? <SectionHead center={center} eyebrow={section.eyebrow} title={section.title} paths={{ eyebrow: edOptional(ctx, `${base}.eyebrow`, 'Sobretítulo (opcional)'), title: ed(ctx, `${base}.title`) }} /> : null}
        {section.paragraphs.some(Boolean) ? (
          <div className="custom-text reveal">
            {section.paragraphs.map((p, i) => (p ? <p key={i} {...ed(ctx, `${base}.paragraphs.${i}`)}>{p}</p> : null))}
          </div>
        ) : null}
        {section.items.some(Boolean) ? (
          <ul className="custom-list reveal">
            {/* Item sem texto não vira um ✓ sozinho */}
            {section.items.map((item, i) =>
              item ? (
                <li key={i}>
                  <Icon name="check" size={18} stroke={2.2} />
                  <span {...ed(ctx, `${base}.items.${i}`)}>{item}</span>
                </li>
              ) : null,
            )}
          </ul>
        ) : null}
        {blocks.length ? (
          <div className="blocks">
            {blocks.map((b, i) =>
              // Foto ainda não escolhida não aparece na página publicada
              (b.type === 'image' && !safeHref(b.url) && !ctx.editable) || (!ctx.editable && blockIsEmpty(b)) ? null : (
                <div key={b.id} className={`blk blk-${b.type} w-${b.width ?? 'full'} reveal`}>
                  <BlockView ctx={ctx} block={b} path={`${base}.blocks.${i}`} />
                </div>
              ),
            )}
          </div>
        ) : null}
        {photos.length ? (
          <div className={`gallery custom-photos g-n${photos.length}`}>
            {photos.map((img) => (
              <figure key={img.url} className="reveal">
                <img referrerPolicy="no-referrer" src={img.url} alt={img.alt} loading="lazy" decoding="async" data-lp-img={img.url} style={img.style} />
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Elemento de texto sem texto (ex.: só um emoji) não aparece na página publicada. */
function blockIsEmpty(b: SectionBlock) {
  if (b.type === 'heading' || b.type === 'text') return !b.text?.trim();
  if (b.type === 'icon') return !b.title?.trim() && !b.text?.trim();
  if (b.type === 'button') return !b.label?.trim();
  return false;
}

function BlockView({ ctx, block: b, path }: { ctx: RenderContext; block: SectionBlock; path: string }) {
  switch (b.type) {
    case 'heading':
      return <h3 {...ed(ctx, `${path}.text`)}>{b.text}</h3>;
    case 'text':
      return <p {...ed(ctx, `${path}.text`)}>{b.text}</p>;
    case 'image': {
      const src = safeHref(b.url);
      if (!src) return <div className="blk-img-empty">Escolha uma imagem no painel</div>;
      return (
        <figure>
          <img referrerPolicy="no-referrer" src={src} alt={b.alt || ctx.displayName} loading="lazy" decoding="async" />
          {b.caption || ctx.editable ? <figcaption {...edOptional(ctx, `${path}.caption`, 'Legenda (opcional)')}>{b.caption}</figcaption> : null}
        </figure>
      );
    }
    case 'icon':
      return (
        <div className="card">
          <div className="icon-box"><Icon name={b.icon} size={24} attrs={edIcon(ctx, `${path}.icon`)} /></div>
          <h3 {...ed(ctx, `${path}.title`)}>{b.title}</h3>
          {b.text || ctx.editable ? <p {...edOptional(ctx, `${path}.text`, 'Descrição (opcional)')}>{b.text}</p> : null}
        </div>
      );
    case 'button': {
      // Sem link próprio, leva ao contato principal da página
      const href = safeHref(b.url) ?? ctx.links.primary;
      const ext = /^https?:/i.test(href);
      return (
        <a className="btn btn-primary" href={href} {...(ext ? { target: '_blank', rel: 'noopener' } : {})}>
          <span {...ed(ctx, `${path}.label`)}>{b.label}</span>
          <Icon name={!b.url && ctx.links.whatsapp ? 'message' : 'arrow'} size={18} stroke={2} />
        </a>
      );
    }
    case 'divider':
      return <hr />;
  }
}
