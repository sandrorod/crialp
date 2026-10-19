import type { RenderContext } from '../context.js';
import { PhotoGrid } from './PhotoGrid.js';

/** Fotos que o editor mandou para o fim desta seção (mesma grade das seções criadas). */
export function SectionPhotos({ ctx, name }: { ctx: RenderContext; name: string }) {
  const photos = ctx.sectionPhotos[name] ?? [];
  if (!photos.length) return null;
  return <PhotoGrid photos={photos} cols={ctx.theme.photoCols} className="gallery custom-photos section-photos" />;
}
