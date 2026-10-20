import type { LpImage } from '../context.js';
import type { CSSProperties } from 'react';
import { photoRows } from '../photoGrid.js';

/**
 * Grade de fotos (galeria, fotos das seções do modelo e das seções criadas). Com "Fotos por linha" escolhido,
 * as fotos vão em linhas justificadas (classe jgrid, CSS em styles.ts); sem escolha, a grade do modelo.
 */
export function PhotoGrid({ photos, cols, className }: { photos: LpImage[]; cols?: number | null; className: string }) {
  const figure = (img: LpImage) => (
    <figure key={img.url} className="reveal">
      <img referrerPolicy="no-referrer" src={img.url} alt={img.alt} loading="lazy" decoding="async" data-lp-img={img.url} style={img.style} />
    </figure>
  );
  if (!cols || cols < 2 || photos.length < 2) {
    return <div className={`${className} g-n${photos.length}`}>{photos.map(figure)}</div>;
  }
  return (
    <div className={`${className} g-n${photos.length} jgrid${photos.length % 2 ? ' j-odd' : ''}`}>
      {photoRows(photos, cols).map((row) =>
        // Linha incompleta: ocupa só a largura de row.length fotos, para ficar do tamanho das outras
        row.length < cols ? (
          <div key={row[0].url} className="jrow jrow-part" style={{ '--jn': cols, '--jk': row.length } as CSSProperties}>{row.map(figure)}</div>
        ) : (
          <div key={row[0].url} className="jrow">{row.map(figure)}</div>
        ),
      )}
    </div>
  );
}
