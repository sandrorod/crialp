import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';
import { AppError, Messages } from '../lib/errors.js';

export const SESSION_COOKIE = 'lp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface AuthUser {
  id: string;
  organizationId: string;
  role: string;
  name: string;
  email: string;
  /** Conta de cliente: as Landing Pages (e as empresas delas) que pode editar */
  landingPageIds: string[];
  companyIds: string[];
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
    if (!user) return null;
    const pages = user.role === 'client' ? await clientPages(user.id) : [];
    return {
      id: user.id,
      organizationId: user.organization_id,
      role: user.role,
      name: user.name,
      email: user.email,
      landingPageIds: pages.map((p) => p.id),
      companyIds: [...new Set(pages.map((p) => p.company_id))],
    };
  } catch {
    return null;
  }
}

/** Sites (Landing Pages) que a conta de cliente pode editar, do mais recente para o mais antigo. */
export async function clientPages(userId: string) {
  const { rows } = await query<{
    id: string; company_id: string; company_name: string | null; title: string; slug: string; status: string;
    custom_domain: string | null; domain_status: string; updated_at: string;
  }>(
    `select lp.id, lp.company_id, coalesce(c.trade_name, c.name) as company_name, lp.title, lp.slug, lp.status,
            lp.custom_domain, lp.domain_status, lp.updated_at
       from lp_client_pages cp
       join landing_pages lp on lp.id = cp.landing_page_id
       left join companies c on c.id = lp.company_id
      where cp.user_id = $1
      order by lp.updated_at desc`,
    [userId],
  );
  return rows;
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
 * Contas de cliente só editam os próprios sites: abrem e salvam as suas Landing Pages, enviam fotos e
 * leem as empresas delas. Publicar, excluir, trocar endereço/domínio e regenerar ficam com a equipe.
 */
export function restrictClients(req: Request, _res: Response, next: NextFunction) {
  const u = req.user;
  if (u?.role !== 'client') return next();
  // Ids (uuid) das páginas e empresas da conta, como alternativas da expressão
  const lp = `(?:${u.landingPageIds.join('|')})`;
  const co = `(?:${u.companyIds.join('|')})`;
  const allowed: [string, RegExp][] = u.landingPageIds.length
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
