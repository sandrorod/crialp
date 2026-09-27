import type { CustomSection } from '../../services/ai/schemas.js';
import { Icon } from './Icon.js';
import { SectionHead } from './SectionHead.js';

/** Seção livre criada pelo administrador (textos do site ou conteúdo próprio). */
export function CustomSectionView({ section, alt }: { section: CustomSection; alt: boolean }) {
  return (
    <section id={`sec-${section.id}`} className={`section${alt ? ' section-alt' : ''}`}>
      <div className="container">
        {section.title ? <SectionHead eyebrow={section.eyebrow} title={section.title} /> : null}
        {section.paragraphs.length ? (
          <div className="custom-text reveal">
            {section.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        {section.items.length ? (
          <ul className="custom-list reveal">
            {section.items.map((item, i) => (
              <li key={i}>
                <Icon name="check" size={18} stroke={2.2} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
