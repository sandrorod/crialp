import type { Response } from 'express';
import { HOME_LOGO } from './homeLogo.js';

/** Página inicial do domínio do sistema (www.labsites.com.br): apresentação simples, sem link para o login. */
const HOME_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lab Sites · Landing Pages profissionais</title><meta name="description" content="Landing Pages profissionais para empresas, feitas a partir das informações reais do site ou do Google Maps."><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f7f9;color:#18181b;padding:24px;text-align:center}main{max-width:560px}.logo{display:inline-block;width:96px;height:96px;border-radius:20px;margin-bottom:20px}h1{font-size:32px;line-height:1.2;font-weight:600;letter-spacing:-.02em;margin:0 0 12px}p{margin:0;color:#52525b;line-height:1.6}footer{margin-top:40px;font-size:12px;color:#a1a1aa}</style></head><body><main><img class="logo" src="${HOME_LOGO}" alt="LabSites" width="96" height="96"><h1>Landing Pages profissionais para empresas</h1><p>A Lab Sites cria a página da sua empresa a partir das informações reais do seu site ou do Google Maps, pronta para receber clientes.</p><footer>© Lab Sites</footer></main></body></html>`;

export function sendHomePage(res: Response) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('html').send(HOME_HTML);
}
