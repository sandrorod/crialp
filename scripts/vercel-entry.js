// Ponto de entrada da função no Vercel (empacotado por scripts/vercel-build.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/index.js';

// As migrations são copiadas para junto do pacote da função
process.env.MIGRATIONS_DIR ??= path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export default function vercelHandler(req, res) {
  // A rota do Vercel pode repassar o caminho original em ?__lp_path=
  const url = new URL(req.url || '/', 'http://x');
  const original = url.searchParams.get('__lp_path');
  if (original !== null) {
    url.searchParams.delete('__lp_path');
    req.url = '/' + original.replace(/^\/+/, '') + url.search;
  }
  return handler(req, res);
}
