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
const s = await seed();
// Conversa do WhatsApp do CRM (org A) para os testes da tela do WhatsApp
const { one } = await import('../src/db/pool.js');
const { saveConfig } = await import('../src/services/crm/whatsapp.js');
const conv = await one<{ id: string }>(
  `insert into lp_crm_conversations (organization_id, phone, push_name, company_id, last_message, last_message_at) values ($1, '5511988887777', 'Cliente Teste', $2, 'Olá, qual o valor?', now()) returning id`,
  [s.orgA, s.a1.companyId],
);
// Mensagens enviadas: uma recente (dá para editar) e uma antiga (passou dos 15 minutos)
await one(
  `insert into lp_crm_messages (conversation_id, direction, type, body, wa_message_id, status, sent_by, created_at) values
     ($1, 'out', 'text', 'Mensagem antiga', 'WA-E2E-OLD', 'read', $2, now() - interval '1 hour'),
     ($1, 'out', 'text', 'Valor: R$ 9,90', 'WA-E2E-1', 'delivered', $2, now()) returning id`,
  [conv!.id, s.ownerA],
);
// Evolution API falsa para o WhatsApp do CRM: responde OK a tudo (sem número real)
const http = await import('node:http');
const evo = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'));
});
await new Promise<void>((r) => evo.listen(PORT + 1, '127.0.0.1', r));
await saveConfig(s.orgA, `http://127.0.0.1:${PORT + 1}`, 'chave-falsa-e2e', 'lp-e2e');
createApp().listen(PORT, '127.0.0.1', () => console.log(`[e2e] sistema em http://localhost:${PORT}`));
