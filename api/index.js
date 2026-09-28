// Função do Vercel: atende API (/api), Landing Pages (/lp/:slug), domínios personalizados e "/".
// O painel (/admin) é servido como estático a partir de dist/admin.
import { createApp } from '../apps/api/dist/app.js';
import { ensureReady } from '../apps/api/dist/ready.js';

const app = createApp();

function setupError(req, res, err) {
  const missing = !process.env.DATABASE_URL;
  const message = err?.setupMessage
    ? `${err.setupMessage} Defina-a nas variáveis de ambiente do projeto no Vercel e faça um novo deploy.`
    : missing
    ? 'Banco de dados não configurado: defina DATABASE_URL nas variáveis de ambiente do projeto no Vercel e faça um novo deploy.'
    : 'Falha ao conectar ao banco de dados. Verifique DATABASE_URL e DATABASE_SSL.';
  console.error('[vercel] falha ao preparar o banco:', err);
  res.statusCode = 503;
  if ((req.url || '').startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: message, code: 'SETUP' }));
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configuração pendente</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f6f7;color:#18181b;padding:24px}main{max-width:520px}h1{font-size:20px}p{color:#52525b;line-height:1.6}</style></head><body><main><h1>Configuração pendente</h1><p>${message}</p></main></body></html>`);
}

export default async function handler(req, res) {
  try {
    await ensureReady(); // migrations + administrador inicial (uma vez por instância)
  } catch (err) {
    return setupError(req, res, err);
  }
  return app(req, res);
}
