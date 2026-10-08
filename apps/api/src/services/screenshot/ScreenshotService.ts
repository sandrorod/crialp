import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { renderFromData } from '../../landing/publish.js';
import type { LandingPageRow } from '../../repositories/landingPages.js';

const VIEWPORT = { width: 1366, height: 900 };
const JPEG_QUALITY = 82;
// Chrome do computador no desenvolvimento local (no Vercel usa o @sparticuz/chromium)
const LOCAL_CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export interface ScreenshotInfo {
  created_at: string;
  width: number | null;
  height: number | null;
  error: string | null;
  available: boolean;
}

async function launchBrowser() {
  const puppeteer = (await import('puppeteer-core')).default;
  if (env.isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    // CHROMIUM_PACK_DIR: cópia da pasta bin do pacote dentro da função (ver scripts/vercel-build.mjs)
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_DIR),
      headless: true,
    });
  }
  return puppeteer.launch({ executablePath: LOCAL_CHROME, headless: true });
}

/** Tira a foto da página inteira (JPG) a partir do HTML renderizado. */
export async function captureHtml(html: string) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    // Movimento reduzido: os textos que "aparecem ao rolar" já ficam visíveis na foto
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    // Caminhos relativos (/uploads, /lp...) resolvem no domínio do sistema
    const withBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${env.appUrl}/">`);
    await page.setContent(withBase, { waitUntil: 'load', timeout: 45_000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
    // Fotos com carregamento preguiçoso só carregam ao rolar: força todas antes da foto
    await page.evaluate(async () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => img.removeAttribute('loading'));
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      await Promise.race([
        Promise.all([
          document.fonts.ready,
          ...Array.from(document.images)
            .filter((img) => !img.complete)
            .map((img) => new Promise((r) => { img.onload = img.onerror = r; })),
        ]),
        new Promise((r) => setTimeout(r, 20_000)),
      ]);
    });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const image = Buffer.from(await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, fullPage: true, captureBeyondViewport: true }));
    return { image, width: VIEWPORT.width, height };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Gera e guarda a imagem da LP. Nunca lança erro: a falha fica registrada
 * (a geração da página não deve falhar por causa da imagem).
 */
export async function generateScreenshot(lp: LandingPageRow): Promise<ScreenshotInfo | null> {
  try {
    const html = await renderFromData(lp);
    if (!html) return null;
    const shot = await captureHtml(html);
    await query(
      `insert into lp_screenshots (landing_page_id, image, width, height, error, created_at) values ($1, $2, $3, $4, null, now())
       on conflict (landing_page_id) do update set image = excluded.image, width = excluded.width, height = excluded.height, error = null, created_at = now()`,
      [lp.id, shot.image, shot.width, shot.height],
    );
  } catch (err) {
    console.error(`[screenshot ${lp.id}]`, err);
    // Mantém a imagem anterior, se houver; só registra o erro
    await query(
      `insert into lp_screenshots (landing_page_id, error, created_at) values ($1, $2, now())
       on conflict (landing_page_id) do update set error = excluded.error`,
      [lp.id, 'Não foi possível gerar a imagem da página.'],
    ).catch(() => {});
  }
  return getScreenshotInfo(lp.id);
}

export function getScreenshotInfo(landingPageId: string) {
  return one<ScreenshotInfo>(
    `select created_at, width, height, error, image is not null as available from lp_screenshots where landing_page_id = $1`,
    [landingPageId],
  );
}

export async function getScreenshotImage(landingPageId: string) {
  const row = await one<{ image: Buffer | null }>('select image from lp_screenshots where landing_page_id = $1', [landingPageId]);
  return row?.image ?? null;
}
