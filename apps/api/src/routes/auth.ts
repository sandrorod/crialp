import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { parseBody } from '../lib/validation.js';
import { authUser, clearSession, issueSession, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos.' },
});

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido.'), password: z.string().min(1).max(200) });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parseBody(LoginSchema, req.body);
  const user = await one<{ id: string; password_hash: string; name: string; email: string; role: string }>(
    'select id, password_hash, name, email, role from users where lower(email) = $1',
    [email],
  );
  // Compara mesmo quando o usuário não existe (tempo constante contra enumeração)
  const ok = await bcrypt.compare(password, user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) throw new AppError(401, 'E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
  await query('update users set last_login_at = now() where id = $1', [user.id]);
  issueSession(res, user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const u = authUser(req);
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
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
  await query('update users set password_hash = $2 where id = $1', [u.id, await bcrypt.hash(body.new_password, 12)]);
  res.json({ ok: true });
});
