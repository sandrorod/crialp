import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one } from '../db/pool.js';
import { AppError, Messages } from '../lib/errors.js';

export const SESSION_COOKIE = 'lp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface AuthUser {
  id: string;
  organizationId: string;
  role: string;
  name: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // inacessível ao JavaScript do navegador
    sameSite: 'lax',
    secure: env.isProduction,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

async function loadUser(req: Request): Promise<AuthUser | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = await one<{ id: string; organization_id: string; role: string; name: string; email: string }>(
      'select id, organization_id, role, name, email from users where id = $1',
      [payload.sub],
    );
    return user ? { id: user.id, organizationId: user.organization_id, role: user.role, name: user.name, email: user.email } : null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await loadUser(req);
  if (!user) return next(new AppError(401, Messages.unauthorized, 'UNAUTHORIZED'));
  req.user = user;
  next();
}

/**
 * Proteção CSRF complementar ao cookie SameSite: toda requisição que altera
 * dados precisa ser JSON (ou multipart de upload) vinda da própria origem.
 */
export function requireSameOriginWrite(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const type = req.headers['content-type'] ?? '';
  const okType = type.startsWith('application/json') || type.startsWith('multipart/form-data') || !req.headers['content-length'] || req.headers['content-length'] === '0';
  const origin = req.headers.origin;
  let okOrigin = !origin;
  try {
    okOrigin ||= env.appHosts.has(new URL(origin!).hostname.toLowerCase());
  } catch {
    okOrigin = false;
  }
  if (!okType || !okOrigin) return next(new AppError(403, 'Requisição não permitida.', 'CSRF'));
  next();
}

export function authUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, Messages.unauthorized, 'UNAUTHORIZED');
  return req.user;
}
