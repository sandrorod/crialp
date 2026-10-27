import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const api = process.env.API_URL ?? 'http://localhost:3333';

/** Em dev, "/" e "/admin" (sem barra) levam direto ao painel; "/lps" abre o login. */
function adminRedirect(): Plugin {
  return {
    name: 'admin-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/';
        // Login em /lps: a mesma página do painel, servida sem mudar o endereço
        if (url === '/lps' || url === '/lps/' || url.startsWith('/lps?')) {
          req.url = `/admin/${url.includes('?') ? url.slice(url.indexOf('?')) : ''}`;
          return next();
        }
        if (url === '/' || url === '/admin' || url.startsWith('/admin?')) {
          res.statusCode = 302;
          res.setHeader('Location', '/admin/' + (url.includes('?') ? url.slice(url.indexOf('?')) : ''));
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/admin/',
  // Versão publicada (commit) nos relatórios de erro do Sentry
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev') },
  plugins: [adminRedirect(), react(), tailwindcss()],
  // Saída em <raiz>/dist/admin: no Vercel a pasta "dist" da raiz é publicada como estática e o painel fica em /admin
  build: { outDir: path.resolve(import.meta.dirname, '../../dist/admin'), emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // Em desenvolvimento, o Vite encaminha API, LPs públicas e uploads para o backend
    proxy: {
      '/api': api,
      '/lp': api,
      '/uploads': api,
    },
  },
});
