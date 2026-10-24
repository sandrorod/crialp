// Compacta imagens no navegador antes do upload (POST /api/uploads).
//
// Redimensiona para um lado máximo (uma foto de celular de 5-10 MB vira
// ~200-500 KB) e re-codifica em WebP com qualidade alta (0.85, visualmente
// igual ao original). WebP mantém transparência, então logotipos PNG com
// fundo vazado continuam vazados. Se o navegador não codificar WebP
// (Safari antigo), cai pra JPEG (sem transparência) ou PNG (com transparência).
//
// Nunca piora o arquivo: se a versão compactada ficar maior que a
// original (ex: PNG pequeno já otimizado), mantém a original.
//
// Depois de compactar, aplica o limite de MAX_UPLOAD_BYTES (2 MB) — o
// mesmo do multer em apps/api/src/routes/misc.ts, que é a barreira real
// no servidor.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Acima disso nem tenta decodificar — evita travar o navegador (celulares
// fracos) com imagens gigantes.
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

// GIF (pode ser animado) e SVG (vetor) perdem conteúdo se passarem pelo
// canvas — só validamos o tamanho.
const SKIP_COMPRESSION_TYPES = ['image/gif', 'image/svg+xml'];

export interface CompressOptions {
  /** Maior lado da imagem final, em pixels. */
  maxDimension?: number;
  /** Qualidade inicial do WebP/JPEG (0–1). */
  quality?: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const tooBigMessage = (file: File, size: number) =>
  `"${file.name}" ficou com ${formatBytes(size)} — o limite é ${formatBytes(MAX_UPLOAD_BYTES)}. Use uma imagem menor.`;

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation corrige fotos de celular que vêm "deitadas" (EXIF).
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* cai no <img> abaixo */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function encode(canvas: HTMLCanvasElement, quality: number, transparent: boolean): Promise<Blob | null> {
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  // Navegador sem encoder WebP devolve PNG silenciosamente.
  if (webp && webp.type === 'image/webp') return webp;
  return transparent ? canvasToBlob(canvas, 'image/png', 1) : canvasToBlob(canvas, 'image/jpeg', quality);
}

const EXT_BY_TYPE: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function renameWithType(file: File, blob: Blob): File {
  const base = file.name.replace(/\.[^.]+$/, '') || 'imagem';
  return new File([blob], `${base}.${EXT_BY_TYPE[blob.type] ?? 'img'}`, { type: blob.type, lastModified: Date.now() });
}

/**
 * Compacta a imagem e garante que ela caiba no limite de 2 MB.
 * Lança Error com mensagem amigável (em português) se não couber.
 */
export async function prepareImageForUpload(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension = 1920, quality = 0.85 } = opts;

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`"${file.name}" tem ${formatBytes(file.size)} — grande demais. Envie uma imagem de até ${formatBytes(MAX_INPUT_BYTES)}.`);
  }
  if (SKIP_COMPRESSION_TYPES.includes(file.type)) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(file, file.size));
    return file;
  }

  let img: Awaited<ReturnType<typeof loadImage>>;
  try {
    img = await loadImage(file);
  } catch {
    // Não conseguiu decodificar (formato exótico) — segue com o original se couber.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(file, file.size));
    return file;
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');

    let dim = maxDimension;
    let q = quality;
    let best: Blob | null = null;
    let transparent: boolean | null = null;

    // Primeira passada com qualidade alta; se ainda passar de 2 MB, reduz
    // qualidade e depois dimensão aos poucos (raro — só imagens enormes e
    // muito detalhadas chegam aqui).
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, dim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img.source, 0, 0, w, h);
      if (transparent === null) transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);

      const blob = await encode(canvas, q, transparent);
      if (blob && (!best || blob.size < best.size)) best = blob;
      if (best && best.size <= MAX_UPLOAD_BYTES) break;

      if (q > 0.7) q = Math.max(0.7, q - 0.08);
      else dim = Math.round(dim * 0.8);
    }

    const resized = Math.max(img.width, img.height) > maxDimension;
    // Mantém o original se a compactação não ajudou e ele já está num tamanho razoável.
    if (!best || (!resized && best.size >= file.size)) {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(file, best?.size ?? file.size));
      return file;
    }
    if (best.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage(file, best.size));
    return renameWithType(file, best);
  } finally {
    img.close();
  }
}
