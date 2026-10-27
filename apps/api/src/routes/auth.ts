import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PgRateLimitStore } from '../lib/rateLimitStore.js';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { parseBody } from '../lib/validation.js';
import { authUser, clearSession, clientPages, issueSession, requireAuth, sellerPages, sellerSites } from '../middleware/auth.js';
import { publicUrl } from '../landing/publish.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  store: new PgRateLimitStore('login-ip'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

// Por conta (além do limite por IP): 5 senhas erradas no mesmo e-mail (de qualquer IP) bloqueiam a conta por 15 min.
// Só conta as que falham, para quem acerta a senha nunca ficar bloqueado por acessos normais.
const loginAccountLimiter = rateLimit({
  store: new PgRateLimitStore('login-account'),
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `login:${String(req.body?.email ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 200)}`,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido.'), password: z.string().min(1).max(200) });

authRouter.post('/login', loginLimiter, loginAccountLimiter, async (req, res) => {
  const { email, password } = parseBody(LoginSchema, req.body);
  const user = await one<{ id: string; password_hash: string; name: string; email: string; role: string }>(
    'select id, password_hash, name, email, role from users where lower(email) = $1',
    [email],
  );
  // Compara mesmo quando o usuário não existe (tempo constante contra enumeração)
  const ok = await bcrypt.compare(password, user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) throw new AppError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
  await query('update users set last_login_at = now() where id = $1', [user.id]);
  issueSession(res, user.id, user.password_hash);
  const pages = user.role === 'client' ? await clientPages(user.id) : user.role === 'seller' ? await sellerPages(user.id) : [];
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, landing_page_ids: pages.map((p) => p.id) } });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const u = authUser(req);
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, landing_page_ids: u.landingPageIds } });
});

/** Conta de cliente: os sites que pode editar (tela "Meus sites", para escolher qual editar). */
authRouter.get('/my-sites', requireAuth, async (req, res) => {
  const u = authUser(req);
  const pages = u.role === 'client' ? await clientPages(u.id) : u.role === 'seller' ? await sellerSites(u.id) : [];
  res.json({ items: pages.map((p) => ({ id: p.id, title: p.company_name || p.title, status: p.status, updated_at: p.updated_at, public_url: publicUrl(p) })) });
});

const PasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(200),
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const u = authUser(req);
  const body = parseBody(PasswordSchema, req.body);
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [u.id]);
  if (!row || !(await bcrypt.compare(body.current_password, row.password_hash))) {
    throw new AppError(400, 'Senha atual incorreta.');
  }
  const newHash = await bcrypt.hash(body.new_password, 12);
  await query('update users set password_hash = $2 where id = $1', [u.id, newHash]);
  // As outras sessões (senha antiga) deixam de valer; esta continua com um token novo
  issueSession(res, u.id, newHash);
  res.json({ ok: true });
});

/** O próprio usuário troca o nome de exibição (o e-mail de login não muda por aqui). */
authRouter.patch('/me', requireAuth, async (req, res) => {
  const u = authUser(req);
  const { name } = parseBody(z.object({ name: z.string().trim().min(1, 'Informe o nome.').max(120) }), req.body);
  await query('update users set name = $2 where id = $1', [u.id, name]);
  res.json({ user: { id: u.id, name, email: u.email, role: u.role, landing_page_ids: u.landingPageIds } });
});
