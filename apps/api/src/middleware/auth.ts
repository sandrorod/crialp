import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';
import { inProspecting } from '../repositories/companies.js';
import { AppError, Messages } from '../lib/errors.js';

export const SESSION_COOKIE = 'lp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export interface AuthUser {
  id: string;
  organizationId: string;
  role: string;
  name: string;
  email: string;
  /** Cliente: as Landing Pages (e as empresas delas) que pode editar. Vendedor: as atribuídas a ele */
  landingPageIds: string[];
  companyIds: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Tipo gravado no token de sessão: outros tokens assinados com o mesmo segredo (ex.: state do Google) não valem como login. */
const SESSION_TYPE = 'session';

/**
 * Impressão da senha atual dentro do token: trocar a senha (ou o administrador redefini-la)
 * invalida as sessões abertas com a senha antiga, sem tabela nova no banco.
 */
export function passwordVersion(passwordHash: string, secret = env.jwtSecret) {
  return createHmac('sha256', secret).update(`pv:${passwordHash}`).digest('base64url').slice(0, 16);
}

export function issueSession(res: Response, userId: string, passwordHash: string) {
  const token = jwt.sign({ sub: userId, typ: SESSION_TYPE, pv: passwordVersion(passwordHash) }, env.jwtSecret, {
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
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
    const payload = verifySessionToken(token);
    if (!payload) return null;
    const user = await one<{ id: string; organization_id: string; role: string; name: string; email: string; password_hash: string }>(
      'select id, organization_id, role, name, email, password_hash from users where id = $1',
      [payload.sub],
    );
    if (!user) return null;
    // Senha trocada depois do login: a sessão antiga deixa de valer.
    // Tokens anteriores a esta versão (sem "pv") seguem válidos só até expirar (no máximo 12 h).
    if (payload.pv !== undefined && payload.pv !== passwordVersion(user.password_hash, payload.secret)) return null;
    const pages = user.role === 'client' ? await clientPages(user.id) : user.role === 'seller' ? await sellerPages(user.id) : [];
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

/**
 * Confere assinatura (só HS256), validade e formato do token de sessão.
 * Recusa tokens de outro uso assinados com o mesmo segredo (o state do Google Drive tem "p").
 */
export function verifySessionToken(token: string): { sub: string; pv?: string; secret: string } | null {
  // Durante a troca do segredo, sessões assinadas com o anterior seguem valendo até expirar
  for (const secret of [env.jwtSecret, env.jwtSecretPrevious].filter((s): s is string => !!s)) {
    const r = verifyWith(token, secret);
    if (r) return { ...r, secret };
  }
  return null;
}

function verifyWith(token: string, secret: string): { sub: string; pv?: string } | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object') return null;
    const { sub, typ, pv, p } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || !sub) return null;
    if (p !== undefined || (typ !== undefined && typ !== SESSION_TYPE)) return null;
    if (pv !== undefined && typeof pv !== 'string') return null;
    return { sub, pv: pv as string | undefined };
  } catch {
    return null;
  }
}

/** Sites (Landing Pages) que a conta de cliente pode editar, do mais recente para o mais antigo. */
export async function clientPages(userId: string) {
  const { rows } = await query<{
    id: string;
    company_id: string;
    company_name: string | null;
    title: string;
    slug: string;
    status: string;
    custom_domain: string | null;
    domain_status: string;
    updated_at: string;
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

/** Lista "Minhas Landing Pages" do vendedor: as atribuídas a ele, da editada mais recentemente para a mais antiga. */
export async function sellerSites(userId: string) {
  const { rows } = await query<{
    id: string;
    company_id: string;
    company_name: string | null;
    title: string;
    slug: string;
    status: string;
    custom_domain: string | null;
    domain_status: string;
    updated_at: string;
  }>(
    `select lp.id, lp.company_id, coalesce(c.trade_name, c.name) as company_name, lp.title, lp.slug, lp.status,
            lp.custom_domain, lp.domain_status, lp.updated_at
       from landing_pages lp left join companies c on c.id = lp.company_id
      where lp.seller_id = $1 and ${inProspecting('c')}
      order by lp.updated_at desc`,
    [userId],
  );
  return rows;
}

/** Landing Pages atribuídas ao vendedor (ele edita o conteúdo delas, como o cliente edita o próprio site). */
export async function sellerPages(userId: string) {
  // Só as páginas de empresas em prospecção (sem ela, o vendedor não acessa a empresa nem a página)
  const { rows } = await query<{ id: string; company_id: string }>(
    `select lp.id, lp.company_id from landing_pages lp join companies c on c.id = lp.company_id where lp.seller_id = $1 and ${inProspecting('c')}`,
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
  const okType =
    type.startsWith('application/json') || type.startsWith('multipart/form-data') || !req.headers['content-length'] || req.headers['content-length'] === '0';
  // Origin ausente (navegadores antigos, alguns modos de privacidade): vale o Referer, se houver
  const source = req.headers.origin ?? req.headers.referer;
  if (!okType || (source !== undefined && !isTrustedOrigin(source))) return next(new AppError(403, 'Requisição não permitida.', 'CSRF'));
  next();
}

/**
 * Origem do próprio painel: host do sistema (APP_URL / APP_HOSTS / deploy do Vercel) e, em produção,
 * só HTTPS — exceto localhost, para rodar o build de produção na própria máquina.
 */
export function isTrustedOrigin(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false; // inclui "null" (iframe isolado, arquivo local)
  }
  if (!env.isAppHost(u.hostname)) return false;
  if (u.protocol === 'https:') return true;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  return u.protocol === 'http:' && (!env.isProduction || local);
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

/** Vendedores acessam Vendas, CRM e a edição das Landing Pages atribuídas a eles: bloqueia o resto da API. */
export function blockSellers(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === 'seller' && !siteEditAllowed(req.user, req))
    return next(new AppError(403, 'Você não tem permissão para acessar esta área.', 'FORBIDDEN'));
  next();
}

/**
 * Contas de cliente só editam os próprios sites: abrem e salvam as suas Landing Pages, enviam fotos e
 * leem as empresas delas, e escolhem o endereço da página. Publicar, excluir, domínio e regenerar ficam com a equipe.
 */
export function restrictClients(req: Request, _res: Response, next: NextFunction) {
  const u = req.user;
  if (u?.role !== 'client') return next();
  if (siteEditAllowed(u, req)) return next();
  next(new AppError(403, 'Você não tem permissão para acessar esta área.', 'FORBIDDEN'));
}

/**
 * Rotas de edição das Landing Pages da conta (cliente: os próprios sites; vendedor: as atribuídas a ele):
 * abrir e salvar a página, enviar fotos, ler a empresa dela e escolher o endereço.
 */
function siteEditAllowed(u: AuthUser, req: Request) {
  // Ids (uuid) das páginas e empresas da conta, como alternativas da expressão
  const lp = `(?:${u.landingPageIds.join('|')})`;
  const co = `(?:${u.companyIds.join('|')})`;
  const allowed: [string, RegExp][] = u.landingPageIds.length
    ? [
        ['GET', /^\/landing-pages\/(labels|templates|presets|icons|icon-categories)$/],
        ['GET', new RegExp(`^/landing-pages/${lp}(/preview|/export)?$`)],
        ['POST', new RegExp(`^/landing-pages/${lp}/(preview|versions/\\d+/restore)$`)],
        ['PUT', new RegExp(`^/landing-pages/${lp}/content$`)],
        // Aba Publicação: o cliente escolhe o endereço da página (o domínio personalizado é barrado na rota)
        ['GET', new RegExp(`^/landing-pages/${lp}/slug-check$`)],
        ['PATCH', new RegExp(`^/landing-pages/${lp}/settings$`)],
        ['GET', new RegExp(`^/companies/${co}(/sources)?$`)],
        ['POST', new RegExp(`^/companies/${co}/images(/remove)?$`)],
        ['POST', /^\/uploads$/],
      ]
    : [];
  return allowed.some(([method, re]) => req.method === method && re.test(req.path));
}
