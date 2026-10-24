// Sistema completo para os testes end-to-end (Playwright, em /e2e): banco de teste zerado com os dados
// conhecidos do seed(), API e painel compilado no mesmo endereço. Só roda em banco cujo nome termina em "_test".
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 4173);
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://lp:lptest@127.0.0.1:54399/lp_test',
  DATABASE_SSL: 'false',
  APP_URL: `http://localhost:${PORT}`,
  APP_HOSTS: 'localhost,127.0.0.1',
  JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres-0123456789',
  STORAGE_DRIVER: 'database',
  AI_PROVIDER: 'gemini',
  WEB_DIST_DIR: path.resolve(import.meta.dirname, '../../../dist/admin'),
});
for (const k of ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'RAPIDAPI_KEY', 'VERCEL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SENTRY_DSN']) delete process.env[k];

// Variáveis acima precisam existir antes de carregar a configuração (env.ts lê na importação)
const { resetDb, seed } = await import('./helpers.js');
const { createApp } = await import('../src/app.js');

await resetDb();
await seed();
createApp().listen(PORT, '127.0.0.1', () => console.log(`[e2e] sistema em http://localhost:${PORT}`));
