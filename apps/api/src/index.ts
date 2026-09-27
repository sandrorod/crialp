import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureAdmin } from './db/bootstrap.js';
import { runMigrations } from './db/migrate.js';
import { jobService } from './services/jobs/JobService.js';
import { aiService } from './services/ai/index.js';

async function main() {
  await runMigrations();
  await ensureAdmin();
  await jobService.failInterrupted();

  if (!aiService.isConfigured()) {
    console.warn(`[ia] chave do provedor "${aiService.providerName}" não definida — análise e geração ficarão indisponíveis.`);
  } else {
    console.log(`[ia] provedor: ${aiService.providerName} · modelo: ${aiService.model}`);
  }

  createApp().listen(env.port, () => {
    console.log(`[api] rodando em http://localhost:${env.port} (${env.isProduction ? 'produção' : 'desenvolvimento'})`);
  });
}

main().catch((err) => {
  console.error('[api] falha ao iniciar:', err);
  process.exit(1);
});
