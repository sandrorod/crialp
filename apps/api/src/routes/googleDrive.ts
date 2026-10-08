import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { authUser } from '../middleware/auth.js';
import { connectDrive, disconnectDrive, driveAuthUrl, driveConfigured, driveStatus } from '../services/google/googleDrive.js';

/** Conexão com o Google Drive (imagem das LPs vai para a pasta "lp"). Só administradores. */
export const googleDriveRouter = Router();

const SETTINGS_PAGE = '/admin/configuracoes';

googleDriveRouter.get('/status', async (_req, res) => {
  res.json(await driveStatus());
});

/** Abre o login do Google (navegação direta do navegador, não fetch). */
googleDriveRouter.get('/connect', (req, res) => {
  const user = authUser(req);
  if (!driveConfigured()) throw new AppError(503, 'Google Drive não configurado no servidor (GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET).');
  // state assinado: o retorno do Google só vale para quem iniciou o login
  const state = jwt.sign({ sub: user.id, p: 'gdrive' }, env.jwtSecret, { expiresIn: '10m' });
  res.redirect(driveAuthUrl(state));
});

/** Retorno do login do Google. */
googleDriveRouter.get('/callback', async (req, res) => {
  const user = authUser(req);
  const { code, state, error } = req.query as Record<string, string | undefined>;
  try {
    if (error) throw new Error(`Google OAuth: ${error}`);
    const payload = jwt.verify(state ?? '', env.jwtSecret) as { sub?: string; p?: string };
    if (payload.sub !== user.id || payload.p !== 'gdrive' || !code) throw new Error('Google OAuth: state inválido');
    await connectDrive(code);
    res.redirect(`${SETTINGS_PAGE}?drive=ok`);
  } catch (err) {
    console.error('[google-drive] conexão:', err);
    res.redirect(`${SETTINGS_PAGE}?drive=erro`);
  }
});

googleDriveRouter.delete('/', async (_req, res) => {
  await disconnectDrive();
  res.json(await driveStatus());
});
