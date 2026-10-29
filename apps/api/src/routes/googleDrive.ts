import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { one } from '../db/pool.js';
import { authUser, MANAGER_ROLES } from '../middleware/auth.js';
import { z } from 'zod';
import { parseBody } from '../lib/validation.js';
import { connectDrive, disconnectDrive, driveAuthUrl, driveConfigured, driveStatus, setCredentials, setTargetFolder } from '../services/google/googleDrive.js';

/** Conexão com o Google Drive (imagem das LPs vai para a pasta "lp"). Só administradores. */
export const googleDriveRouter = Router();

const SETTINGS_PAGE = '/admin/configuracoes';

googleDriveRouter.get('/status', async (_req, res) => {
  res.json(await driveStatus());
});

/** Abre o login do Google (navegação direta do navegador, não fetch). */
googleDriveRouter.get('/connect', async (req, res) => {
  const user = authUser(req);
  if (!(await driveConfigured())) throw new AppError(503, 'Google Drive não configurado: cadastre a credencial do Google em Configurações → Google Drive.');
  // state assinado: o retorno do Google só vale para quem iniciou o login. Leva também o endereço do painel em
  // que a pessoa está, para voltar a ele (o Google volta pelo endereço cadastrado, que pode ser outro: www, vercel.app…)
  const host = req.get('host') ?? '';
  const state = jwt.sign({ sub: user.id, p: 'gdrive', typ: 'gdrive-state', ...(env.isSystemHost(host) ? { h: host } : {}) }, env.jwtSecret, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
  res.redirect(await driveAuthUrl(state));
});

/**
 * Retorno do login do Google (rota pública, registrada antes da exigência de login em app.ts): o Google volta pelo
 * endereço cadastrado no Google Cloud, onde o navegador pode não ter a sessão do painel (outro domínio). Quem
 * conectou vem do state assinado (10 min); precisa continuar sendo da gerência.
 */
export async function googleDriveCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  let back = SETTINGS_PAGE;
  try {
    const payload = jwt.verify(state ?? '', env.jwtSecret, { algorithms: ['HS256'] }) as { sub?: string; p?: string; typ?: string; h?: string };
    if (payload.h && env.isSystemHost(payload.h)) back = `${req.protocol === 'http' && !env.isProduction ? 'http' : 'https'}://${payload.h}${SETTINGS_PAGE}`;
    if (error) throw new Error(`Google OAuth: ${error}`);
    if (payload.p !== 'gdrive' || payload.typ !== 'gdrive-state' || !payload.sub || !code) throw new Error('Google OAuth: state inválido');
    const user = await one<{ role: string }>('select role from users where id = $1', [payload.sub]);
    if (!user || !MANAGER_ROLES.includes(user.role)) throw new Error('Google OAuth: usuário sem permissão');
    await connectDrive(code);
    res.redirect(`${back}?drive=ok`);
  } catch (err) {
    console.error('[google-drive] conexão:', err);
    res.redirect(`${back}?drive=erro`);
  }
}

/** Pasta de destino das imagens (link ou id do Drive; vazio volta à pasta "lp" criada pelo sistema). */
googleDriveRouter.put('/folder', async (req, res) => {
  const folder = typeof req.body?.folder === 'string' ? req.body.folder : null;
  try {
    await setTargetFolder(folder);
  } catch (err) {
    throw new AppError(400, err instanceof Error ? err.message : 'Pasta inválida.');
  }
  res.json(await driveStatus());
});

/** Credencial do Google (OAuth) cadastrada em Configurações; troca desconecta a conta (é preciso conectar de novo). */
const CredentialSchema = z.object({
  client_id: z
    .string()
    .trim()
    .max(200)
    .regex(/^[\w-]+\.apps\.googleusercontent\.com$/, 'ID do cliente inválido: termina em ".apps.googleusercontent.com".'),
  client_secret: z.string().trim().min(10, 'Chave secreta do cliente inválida.').max(200, 'Chave secreta do cliente inválida.'),
});

googleDriveRouter.put('/credentials', async (req, res) => {
  const body = parseBody(CredentialSchema, req.body);
  await setCredentials({ clientId: body.client_id, clientSecret: body.client_secret });
  res.json(await driveStatus());
});

/** Volta a usar a credencial das variáveis da Vercel (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET). */
googleDriveRouter.delete('/credentials', async (_req, res) => {
  await setCredentials(null);
  res.json(await driveStatus());
});

googleDriveRouter.delete('/', async (_req, res) => {
  await disconnectDrive();
  res.json(await driveStatus());
});
