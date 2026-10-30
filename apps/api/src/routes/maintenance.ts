import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import type { LandingPageRow } from '../repositories/landingPages.js';
import { generateScreenshot } from '../services/screenshot/ScreenshotService.js';

/**
 * Manutenção temporária (sem login, com senha de uso único guardada como hash em lp_settings e prazo):
 * refaz o print das LPs ativas e envia ao Google Drive, algumas por chamada (limite de tempo da função).
 */
export const maintenanceRouter = Router();

const BUDGET_MS = 200_000;

async function authorized(token: string | undefined) {
  const row = await one<{ value: string }>(`select value from lp_settings where key = 'maintenance_screenshots'`);
  if (!row || !token) return false;
  const cfg = JSON.parse(row.value) as { token_sha256?: string; expires_at?: string };
  if (!cfg.token_sha256 || !cfg.expires_at || Date.now() > new Date(cfg.expires_at).getTime()) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'));
  const b = Buffer.from(cfg.token_sha256);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

maintenanceRouter.post('/screenshots', async (req, res) => {
  if (!(await authorized(req.get('x-maintenance-token')))) throw new AppError(404, 'Rota não encontrada.');
  // limit: quantas LPs nesta chamada; peek: só lista as próximas (para achar e pular uma que trave o print)
  const { after, limit, peek } = z
    .object({ after: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).default(50), peek: z.boolean().optional() })
    .parse(req.body ?? {});
  const started = Date.now();
  const { rows } = await query<LandingPageRow>(
    `select * from landing_pages where status = 'ativa' and ($1::uuid is null or id > $1::uuid) order by id limit $2`,
    [after ?? null, limit],
  );
  if (peek) return void res.json({ next: rows.map((r) => ({ id: r.id, slug: r.slug })) });
  const done: { id: string; slug: string; ok: boolean; drive: boolean; error: string | null }[] = [];
  let last = after ?? null;
  for (const lp of rows) {
    if (Date.now() - started > BUDGET_MS) break;
    const info = await generateScreenshot(lp);
    done.push({
      id: lp.id,
      slug: lp.slug,
      ok: !!info?.available && !info.error,
      drive: !!info?.drive_file_id && !info.drive_error,
      error: info?.error ?? info?.drive_error ?? null,
    });
    last = lp.id;
  }
  const remaining = await one<{ n: number }>(`select count(*)::int as n from landing_pages where status = 'ativa' and ($1::uuid is null or id > $1::uuid)`, [
    last,
  ]);
  res.json({ done, next_after: last, remaining: remaining?.n ?? 0 });
});
