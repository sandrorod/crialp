import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureReady } from './ready.js';
import { jobService } from './services/jobs/JobService.js';
import { aiService } from './services/ai/index.js';

async function main() {
  await ensureReady();
  // Servidor contínuo: nada mais está rodando, então qualquer tarefa pendente foi interrompida
  await jobService.failInterrupted();

  if (!(await aiService.isConfigured())) {
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
