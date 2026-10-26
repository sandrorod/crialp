/**
 * GIF → figurinha animada do WhatsApp: WebP animado de 512×512 com o GIF inteiro centralizado sobre fundo
 * transparente (sem cortar nem esticar) e até 500 KB, o limite das figurinhas animadas.
 * Usa a sharp (binário nativo); se ela não carregar, devolve null e o envio segue sem conversão.
 */
export const STICKER_SIZE = 512;
export const STICKER_MAX_BYTES = 500 * 1024;

type Sharp = typeof import('sharp');
let sharpLib: Sharp | null | undefined;
async function loadSharp() {
  if (sharpLib === undefined) {
    try {
      sharpLib = (await import('sharp')).default as unknown as Sharp;
    } catch (err) {
      console.error('[crm] sharp indisponível: figurinhas vão sem conversão', err);
      sharpLib = null;
    }
  }
  return sharpLib;
}

export async function gifToSticker(gif: Buffer): Promise<Buffer | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  // Qualidade cai até caber no limite; GIF que não cabe nem assim fica para a próxima versão (menos quadros)
  for (const quality of [75, 55, 40]) {
    const out = await sharp(gif, { animated: true, limitInputPixels: 80_000_000 })
      .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality, effort: 4, loop: 0 })
      .toBuffer();
    if (out.length <= STICKER_MAX_BYTES) return out;
  }
  return null;
}
