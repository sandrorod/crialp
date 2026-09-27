// Função do Vercel: atende API (/api), Landing Pages (/lp/:slug), domínios personalizados e "/".
// O painel (/admin) é servido como estático a partir de apps/web/dist.
import { createApp } from '../apps/api/dist/app.js';
import { ensureReady } from '../apps/api/dist/ready.js';

const app = createApp();

export default async function handler(req, res) {
  try {
    await ensureReady(); // migrations + administrador inicial (uma vez por instância)
  } catch (err) {
    console.error('[vercel] falha ao preparar o banco:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Falha ao conectar ao banco de dados. Verifique DATABASE_URL e DATABASE_SSL.' }));
    return;
  }
  return app(req, res);
}
