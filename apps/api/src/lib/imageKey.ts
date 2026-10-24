/** Regras para reconhecer a mesma foto em endereços diferentes (tamanhos, CDNs, otimizadores). */

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** Parâmetros que só mudam o tamanho/qualidade da mesma foto em CDNs e otimizadores. */
const SIZE_PARAMS = /^(w|h|q|width|height|quality|fit|format|fm|auto|dpr|crop|resize|size|v|ver|version)$/i;

/**
 * Endereço que identifica a foto. Otimizadores servem fotos diferentes pelo mesmo caminho
 * (Next.js: /_next/image?url=..., Nuxt/Vercel: ?url=...), então a foto está no parâmetro;
 * em caminhos sem extensão o parâmetro também distingue uma foto da outra.
 */
export function imageIdentity(url: string) {
  try {
    const u = new URL(url);
    const inner = u.searchParams.get('url') ?? u.searchParams.get('src') ?? u.searchParams.get('image');
    if (inner && (IMG_EXT.test(inner) || /^(https?:)?\/\//.test(inner) || inner.startsWith('/'))) {
      // Caminho relativo (/_next/image?url=%2Fimg%2Fa.jpg) vale o mesmo que o endereço completo
      try {
        return new URL(inner, u).toString();
      } catch {
        return inner;
      }
    }
    // Cloudflare: /cdn-cgi/image/width=800,quality=80/fotos/a.jpg
    const cf = /\/cdn-cgi\/image\/[^/]+(\/.+)$/.exec(u.pathname);
    if (cf) return `${u.origin}${cf[1]}`;
    if (IMG_EXT.test(u.pathname)) return url;
    const kept = [...u.searchParams].filter(([k]) => !SIZE_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
    return `${u.origin}${u.pathname}${kept.length ? `@${new URLSearchParams(kept)}` : ''}`;
  } catch {
    return url;
  }
}

/** Mesma foto em tamanhos diferentes (WordPress: foto-700x480.jpg) conta uma vez só. */
export function imageKey(url: string) {
  let u = imageIdentity(url);
  try {
    u = decodeURIComponent(u);
  } catch {
    /* URL com % inválido: compara como está */
  }
  return (
    u
      .replace(/[\u200b-\u200d\ufeff]/g, '') // caracteres invisíveis no nome do arquivo
      .toLowerCase()
      .replace(/[?#].*$/, '')
      .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, '')
      .replace(/-\d{2,4}x(?=\.\w+$)/, '')
      .replace(/^.*\/wp-content\//, 'wp/')
      // Google (fotos do perfil): mesma foto com "=w1600-h1200-k-no", "=s1360-w1360-h1020"…
      .replace(/^(https?:\/\/[^/]*googleusercontent\.com\/.+?)=[a-z0-9-]+$/, '$1')
      // Wix: …/media/abc~mv2.jpg/v1/fill/w_800,h_600/abc~mv2.jpg → a foto é o que vem antes de /v1/
      .replace(/^(.*wixstatic\.com\/media\/[^/]+)\/v1\/.*$/, '$1')
      // Shopify: foto_800x.jpg, foto_large.jpg, foto_1024x1024@2x.jpg
      .replace(/_(\d{2,4}x\d{0,4}|pico|icon|thumb|small|compact|medium|large|grande|original|master)(@\dx)?(?=\.\w+$)/, '')
      // Cloudinary: /upload/w_800,c_fill/v123/foto.jpg → /upload/foto.jpg
      .replace(/(\/upload\/)(?:[a-z]{1,2}_[^/]+\/)*(?:v\d+\/)?/, '$1')
      .replace(/@\dx(?=\.\w+$)/, '')
      .replace(/-scaled(?=\.\w+$)/, '')
      .replace(/\.(jpe?g|png|webp|gif|avif)$/, '')
  );
}
