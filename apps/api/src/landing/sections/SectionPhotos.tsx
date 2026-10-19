import type { RenderContext } from '../context.js';
import { lastRowClass } from '../photoGrid.js';

/** Fotos que o editor mandou para o fim desta seção (mesma grade das seções criadas). */
export function SectionPhotos({ ctx, name }: { ctx: RenderContext; name: string }) {
  const photos = ctx.sectionPhotos[name] ?? [];
  if (!photos.length) return null;
  return (
    <div className={`gallery custom-photos section-photos g-n${photos.length}`}>
      {photos.map((img, i) => (
        <figure key={img.url} className={`reveal${lastRowClass(i, photos.length, ctx.theme.photoCols)}`}>
          <img referrerPolicy="no-referrer" src={img.url} alt={img.alt} loading="lazy" decoding="async" data-lp-img={img.url} style={img.style} />
        </figure>
      ))}
    </div>
  );
}
