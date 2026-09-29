import type { CustomSection } from '../../services/ai/schemas.js';
import { ed, edOptional, type RenderContext } from '../context.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

/** Seção livre criada pelo administrador (textos do site ou conteúdo próprio). */
export function CustomSectionView({ ctx, section, alt }: { ctx: RenderContext; section: CustomSection; alt: boolean }) {
  const base = `custom.${section.id}`;
  return (
    <section id={`sec-${section.id}`} className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        {section.title ? <SectionHead eyebrow={section.eyebrow} title={section.title} paths={{ eyebrow: edOptional(ctx, `${base}.eyebrow`, 'Sobretítulo (opcional)'), title: ed(ctx, `${base}.title`) }} /> : null}
        {section.paragraphs.length ? (
          <div className="custom-text reveal">
            {section.paragraphs.map((p, i) => (
              <p key={i} {...ed(ctx, `${base}.paragraphs.${i}`)}>{p}</p>
            ))}
          </div>
        ) : null}
        {section.items.length ? (
          <ul className="custom-list reveal">
            {section.items.map((item, i) => (
              <li key={i}>
                <Icon name="check" size={18} stroke={2.2} />
                <span {...ed(ctx, `${base}.items.${i}`)}>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
