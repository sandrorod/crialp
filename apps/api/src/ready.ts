import { ensureAdmin } from './db/bootstrap.js';
import { runMigrations } from './db/migrate.js';
import { jobService } from './services/jobs/JobService.js';

let ready: Promise<void> | null = null;

/**
 * Prepara banco e administrador uma única vez por processo.
 * No servidor contínuo roda na inicialização; no Vercel, na primeira requisição de cada instância.
 */
export function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await runMigrations();
    await ensureAdmin();
    await jobService.failStale();
  })().catch((err) => {
    ready = null; // permite nova tentativa na próxima requisição
    throw err;
  });
  return ready;
}
