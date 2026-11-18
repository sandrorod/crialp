import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { renderFromData } from '../../landing/publish.js';
import type { LandingPageRow } from '../../repositories/landingPages.js';
import { downloadFromDrive, uploadJpgToDrive } from '../google/googleDrive.js';
import { assertPublicHost } from '../../lib/url.js';

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
  /** O print fica SÓ no Google Drive (não é guardado no banco); drive_error quando o envio falhou */
  drive_file_id: string | null;
  drive_error: string | null;
}

/**
 * O HTML da página traz URLs de imagens digitadas no cadastro: o navegador só busca endereços públicos
 * (ou o próprio sistema, para /uploads), nunca a rede interna nem a metadata da nuvem.
 */
export async function allowBrowserRequest(raw: string, cache = new Map<string, Promise<boolean>>()): Promise<boolean> {
  if (raw.startsWith('data:') || raw.startsWith('about:') || raw.startsWith('blob:')) return true;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  if (u.host === new URL(env.appUrl).host) return true;
  const key = u.hostname;
  if (!cache.has(key))
    cache.set(
      key,
      assertPublicHost(u).then(
        () => true,
        () => false,
      ),
    );
  return cache.get(key)!;
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

/** Tira a foto (JPG) das 3 primeiras seções da página a partir do HTML renderizado. */
export async function captureHtml(html: string) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    const allowed = new Map<string, Promise<boolean>>();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.isInterceptResolutionHandled()) return;
      void allowBrowserRequest(req.url(), allowed).then((ok) => (ok ? req.continue() : req.abort('blockedbyclient')).catch(() => {}));
    });
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
            .map(
              (img) =>
                new Promise((r) => {
                  img.onload = img.onerror = r;
                }),
            ),
        ]),
        new Promise((r) => setTimeout(r, 20_000)),
      ]);
    });
    // Só as 3 primeiras seções, com o menu do cabeçalho
    const bottom = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section')).filter(
        (el) => !el.parentElement?.closest('section') && getComputedStyle(el).display !== 'none',
      );
      const keep = sections.slice(0, 3);
      document.querySelectorAll('section, footer').forEach((el) => {
        if (!keep.some((k) => k === el || k.contains(el))) (el as HTMLElement).style.setProperty('display', 'none', 'important');
      });
      // Fim da última seção mantida: a imagem termina ali (sem faixa vazia embaixo)
      return Math.max(0, ...keep.map((k) => k.getBoundingClientRect().bottom + window.scrollY));
    });
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.ceil(Math.min(bottom || pageHeight, pageHeight));
    // Janela com a altura do trecho inteiro e fotos decodificadas: sem isso o Chrome não desenha as fotos que
    // ficam abaixo da tela (ex.: a galeria saía só com os quadros vazios)
    await page.setViewport({ ...VIEWPORT, height: Math.max(VIEWPORT.height, height), deviceScaleFactor: 1 });
    await page.evaluate(async () => {
      await Promise.race([Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 10_000))]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const image = Buffer.from(
      await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, clip: { x: 0, y: 0, width: VIEWPORT.width, height }, captureBeyondViewport: true }),
    );
    return { image, width: VIEWPORT.width, height };
  } finally {
    await browser.close().catch(() => {});
  }
}

// Um print por vez em cada instância: na Vercel, pedidos simultâneos (ativar várias LPs seguidas) podem cair
// na mesma instância, e dois Chromes juntos estouram a memória e derrubam a função sem registrar nada.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** Tira o print; se o Chrome falhar (acontece às vezes ao abrir na Vercel), tenta mais uma vez. */
async function captureWithRetry(html: string) {
  try {
    return await captureHtml(html);
  } catch (err) {
    console.warn('[screenshot] nova tentativa após falha:', err);
    return captureHtml(html);
  }
}

/**
 * Gera a imagem da LP e envia ao Google Drive (o banco guarda só os dados do arquivo, nunca a imagem).
 * Nunca lança erro: a falha fica registrada (a geração da página não deve falhar por causa da imagem).
 */
export function generateScreenshot(lp: LandingPageRow): Promise<ScreenshotInfo | null> {
  return oneAtATime(() => generateNow(lp));
}

async function generateNow(lp: LandingPageRow): Promise<ScreenshotInfo | null> {
  let shot: Awaited<ReturnType<typeof captureHtml>>;
  try {
    const html = await renderFromData(lp);
    if (!html) return null;
    shot = await captureWithRetry(html);
  } catch (err) {
    console.error(`[screenshot ${lp.id}]`, err);
    await recordError(lp.id, 'Não foi possível gerar a imagem da página.');
    return getScreenshotInfo(lp.id);
  }
  try {
    const row = await one<{ drive_file_id: string | null }>('select drive_file_id from lp_screenshots where landing_page_id = $1', [lp.id]);
    // Nome do arquivo: id da empresa
    const fileId = await uploadJpgToDrive(`${lp.company_id}.jpg`, shot.image, row?.drive_file_id ?? null);
    if (!fileId) throw new Error('Google Drive não conectado: conecte em Configurações → Google Drive.');
    await query(
      `insert into lp_screenshots (landing_page_id, image, width, height, drive_file_id, error, drive_error, created_at)
       values ($1, null, $2, $3, $4, null, null, now())
       on conflict (landing_page_id) do update set image = null, width = excluded.width, height = excluded.height,
         drive_file_id = excluded.drive_file_id, error = null, drive_error = null, created_at = now()`,
      [lp.id, shot.width, shot.height, fileId],
    );
  } catch (err) {
    console.error(`[screenshot ${lp.id}] Google Drive:`, err);
    // Sem Drive o print não fica guardado em lugar nenhum: vira erro do print (mantém o arquivo anterior, se houver)
    await recordError(lp.id, driveErrorMessage(err));
  }
  return getScreenshotInfo(lp.id);
}

async function recordError(landingPageId: string, message: string) {
  await query(
    `insert into lp_screenshots (landing_page_id, error, created_at) values ($1, $2, now())
     on conflict (landing_page_id) do update set error = excluded.error`,
    [landingPageId, message],
  ).catch(() => {});
}

/** Motivo da falha no envio ao Drive, em texto para o painel. */
function driveErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith('Google Drive não') || raw.includes('Configurações')) return raw;
  if (/accessNotConfigured|has not been used|SERVICE_DISABLED/i.test(raw))
    return 'A Google Drive API está desativada no projeto do Google Cloud: ative-a em APIs e serviços → Biblioteca → Google Drive API.';
  if (/rateLimitExceeded|userRateLimit|quotaExceeded|\b429\b/i.test(raw))
    return 'O Google Drive limitou os envios por alguns instantes: gere o print de novo em "Novo print" no editor.';
  if (/invalid_client|unauthorized_client/i.test(raw)) return 'ID ou chave secreta do OAuth do Google inválidos na Vercel (GOOGLE_OAUTH_CLIENT_ID / SECRET).';
  if (/insufficient|403/i.test(raw)) return `O Google Drive recusou o envio (sem permissão): conecte de novo em Configurações. Detalhe: ${raw.slice(0, 160)}`;
  return `Não foi possível enviar a imagem ao Google Drive. Detalhe: ${raw.slice(0, 160)}`;
}

export function getScreenshotInfo(landingPageId: string) {
  return one<ScreenshotInfo>(
    `select created_at, width, height, error, drive_file_id is not null as available, drive_file_id, drive_error from lp_screenshots where landing_page_id = $1`,
    [landingPageId],
  );
}

/** Baixa o print do Google Drive (é o único lugar onde ele fica guardado). */
export async function getScreenshotImage(landingPageId: string) {
  const row = await one<{ drive_file_id: string | null }>('select drive_file_id from lp_screenshots where landing_page_id = $1', [landingPageId]);
  return row?.drive_file_id ? downloadFromDrive(row.drive_file_id) : null;
}
