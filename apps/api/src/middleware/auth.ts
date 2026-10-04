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
  /** Conta de cliente: a única Landing Page (e a empresa dela) que pode editar */
  landingPageId: string | null;
  companyId: string | null;
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
    const user = await one<{ id: string; organization_id: string; role: string; name: string; email: string; landing_page_id: string | null; company_id: string | null }>(
      `select u.id, u.organization_id, u.role, u.name, u.email, u.landing_page_id, lp.company_id
         from users u left join landing_pages lp on lp.id = u.landing_page_id
        where u.id = $1`,
      [payload.sub],
    );
    return user
      ? { id: user.id, organizationId: user.organization_id, role: user.role, name: user.name, email: user.email, landingPageId: user.landing_page_id, companyId: user.company_id }
      : null;
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
    okOrigin ||= env.isAppHost(new URL(origin!).hostname);
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

/** Papéis que administram o sistema (empresas, Landing Pages, subusuários). */
export const MANAGER_ROLES = ['owner', 'admin'];

/** Libera a rota apenas para os papéis informados. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, 'Você não tem permissão para acessar esta área.', 'FORBIDDEN'));
    next();
  };
}

/** Vendedores só acessam a área de Vendas: bloqueia todo o resto da API. */
export function blockSellers(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === 'seller') return next(new AppError(403, 'Você não tem permissão para acessar esta área.', 'FORBIDDEN'));
  next();
}

/**
 * Contas de cliente só editam o próprio site: abrem e salvam a sua Landing Page, enviam fotos e
 * leem a empresa dela. Publicar, excluir, trocar endereço/domínio e regenerar ficam com a equipe.
 */
export function restrictClients(req: Request, _res: Response, next: NextFunction) {
  const u = req.user;
  if (u?.role !== 'client') return next();
  const lp = u.landingPageId;
  const co = u.companyId;
  const allowed: [string, RegExp][] = lp && co
    ? [
        ['GET', /^\/landing-pages\/(labels|templates|presets|icons|icon-categories)$/],
        ['GET', new RegExp(`^/landing-pages/${lp}(/preview|/export)?$`)],
        ['POST', new RegExp(`^/landing-pages/${lp}/(preview|versions/\\d+/restore)$`)],
        ['PUT', new RegExp(`^/landing-pages/${lp}/content$`)],
        ['GET', new RegExp(`^/companies/${co}(/sources)?$`)],
        ['POST', new RegExp(`^/companies/${co}/images(/remove)?$`)],
        ['POST', /^\/uploads$/],
      ]
    : [];
  if (allowed.some(([method, re]) => req.method === method && re.test(req.path))) return next();
  next(new AppError(403, 'Você não tem permissão para acessar esta área.', 'FORBIDDEN'));
}
