import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';

/**
 * Manutenção temporária (sem login, com senha de uso único guardada como hash em lp_settings e prazo):
 * atribui ao vendedor Hermano todas as LPs cuja empresa tem WP verificado preenchido.
 */
export const maintenanceRouter = Router();

async function authorized(token: string | undefined) {
  const row = await one<{ value: string }>(`select value from lp_settings where key = 'maintenance_assign_seller'`);
  if (!row || !token) return false;
  const cfg = JSON.parse(row.value) as { token_sha256?: string; expires_at?: string };
  if (!cfg.token_sha256 || !cfg.expires_at || Date.now() > new Date(cfg.expires_at).getTime()) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'));
  const b = Buffer.from(cfg.token_sha256);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const VERIFIED = `nullif(trim(c.wp_verificado), '') is not null`;

// apply ausente: só mostra a prévia (vendedor encontrado e quantas LPs entram, por vendedor atual)
maintenanceRouter.post('/assign-seller', async (req, res) => {
  if (!(await authorized(req.get('x-maintenance-token')))) throw new AppError(404, 'Rota não encontrada.');
  const { apply } = z.object({ apply: z.boolean().optional() }).parse(req.body ?? {});
  const { rows: sellers } = await query<{ id: string; name: string; email: string; organization_id: string }>(
    `select id, name, email, organization_id from users where role = 'seller' and name ilike '%hermano%'`,
  );
  if (sellers.length !== 1) return res.json({ sellers, error: 'Era esperado exatamente um vendedor Hermano.' });
  const seller = sellers[0];
  const { rows: preview } = await query<{ current: string | null; total: number }>(
    `select coalesce(u.name, '(sem vendedor)') as current, count(*)::int as total
       from landing_pages lp join companies c on c.id = lp.company_id left join users u on u.id = lp.seller_id
      where lp.organization_id = $1 and ${VERIFIED}
      group by 1 order by 2 desc`,
    [seller.organization_id],
  );
  if (!apply) return res.json({ seller, preview });
  const { rowCount: updated } = await query(
    `update landing_pages lp set seller_id = $1
       from companies c
      where c.id = lp.company_id and lp.organization_id = $2 and ${VERIFIED} and lp.seller_id is distinct from $1`,
    [seller.id, seller.organization_id],
  );
  const total = await one<{ n: number }>(
    `select count(*)::int as n from landing_pages lp join companies c on c.id = lp.company_id
      where lp.seller_id = $1 and ${VERIFIED}`,
    [seller.id],
  );
  res.json({ seller, preview, updated, total_with_wp_verificado: total?.n ?? 0 });
});
