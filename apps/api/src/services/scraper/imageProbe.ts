import { assertPublicHost } from '../../lib/url.js';

export interface ImageSize {
  width: number;
  height: number;
  type: 'png' | 'jpg' | 'gif' | 'webp';
}

/** Lê largura/altura do cabeçalho binário (PNG, JPEG, GIF, WebP) sem baixar a imagem inteira. */
export function parseImageSize(buf: Uint8Array): ImageSize | null {
  const b = Buffer.from(buf);
  if (b.length < 24) return null;
  // PNG
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), type: 'png' };
  // GIF
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), type: 'gif' };
  // WebP
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && b.length >= 30) return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, type: 'webp' };
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: 'webp' };
    }
    if (chunk === 'VP8X' && b.length >= 30) return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), type: 'webp' };
    return null;
  }
  // JPEG: percorre os marcadores até um SOF
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), type: 'jpg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Baixa só o início do arquivo (Range) e devolve as dimensões; null se não for imagem suportada. */
export async function probeImage(url: string, timeoutMs = 7000): Promise<ImageSize | null> {
  try {
    const u = new URL(url);
    await assertPublicHost(u);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(u, {
        signal: controller.signal,
        headers: { Range: 'bytes=0-65535', 'User-Agent': 'Mozilla/5.0 LPBot/1.0', Accept: 'image/webp,image/png,image/jpeg,image/*' },
      });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < 65536) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
        const size = parseImageSize(Buffer.concat(chunks));
        if (size) {
          await reader.cancel().catch(() => {});
          return size;
        }
      }
      await reader.cancel().catch(() => {});
      return parseImageSize(Buffer.concat(chunks));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** Executa tarefas com concorrência limitada. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
