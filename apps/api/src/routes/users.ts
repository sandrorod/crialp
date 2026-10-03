import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db/pool.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseBody, uuidParam } from '../lib/validation.js';
import { authUser } from '../middleware/auth.js';
import { distributeUnassignedPages } from '../repositories/landingPages.js';

/** Subusuários: administradores criam e gerenciam contas de Administrador e Vendedor. */
export const usersRouter = Router();

// Papéis que podem ser atribuídos pelo painel ("owner" é a conta principal e não é atribuível)
const AssignableRole = z.enum(['admin', 'seller'], { message: 'Tipo de conta inválido.' });
const Email = z.string().trim().toLowerCase().email('E-mail inválido.').max(200);
const Password = z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(200);
const Name = z.string().trim().min(1, 'Informe o nome.').max(120);

const COLUMNS = 'id, name, email, role, last_login_at, created_at';

usersRouter.get('/', async (req, res) => {
  const user = authUser(req);
  const { rows } = await query(`select ${COLUMNS} from users where organization_id = $1 and role <> 'client' order by created_at`, [user.organizationId]);
  res.json(rows);
});

const CreateSchema = z.object({ name: Name, email: Email, password: Password, role: AssignableRole });

usersRouter.post('/', async (req, res) => {
  const user = authUser(req);
  const body = parseBody(CreateSchema, req.body);
  await ensureEmailFree(body.email);
  const created = await one(
    `insert into users (organization_id, name, email, password_hash, role) values ($1, $2, $3, $4, $5) returning ${COLUMNS}`,
    [user.organizationId, body.name, body.email, await bcrypt.hash(body.password, 12), body.role],
  );
  // Páginas que estavam sem vendedor passam a ter um responsável
  if (body.role === 'seller') await distributeUnassignedPages(user.organizationId);
  res.status(201).json(created);
});

const UpdateSchema = z.object({
  name: Name.optional(),
  email: Email.optional(),
  role: AssignableRole.optional(),
  // Nova senha (opcional): redefine a senha de acesso do subusuário
  password: Password.optional(),
});

usersRouter.patch('/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const body = parseBody(UpdateSchema, req.body);
  const target = await findTarget(user.organizationId, id);
  if (target.role === 'owner' && target.id !== user.id) throw new AppError(403, 'A conta principal só pode ser alterada por ela mesma.', 'FORBIDDEN');
  if (body.role && (target.id === user.id || target.role === 'owner')) throw new AppError(400, 'Você não pode alterar o tipo da sua própria conta.');
  if (body.email && body.email !== target.email) await ensureEmailFree(body.email);

  const updated = await one(
    `update users set
       name = coalesce($2, name),
       email = coalesce($3, email),
       role = coalesce($4, role),
       password_hash = coalesce($5, password_hash)
     where id = $1 returning ${COLUMNS}`,
    [id, body.name ?? null, body.email ?? null, body.role ?? null, body.password ? await bcrypt.hash(body.password, 12) : null],
  );
  // Deixou de ser vendedor: as páginas dele vão para os demais; virou vendedor: recebe as que estavam sem responsável
  if (body.role && body.role !== target.role) {
    if (target.role === 'seller') await query('update landing_pages set seller_id = null where seller_id = $1', [id]);
    await distributeUnassignedPages(user.organizationId);
  }
  res.json(updated);
});

usersRouter.delete('/:id', async (req, res) => {
  const user = authUser(req);
  const id = uuidParam.parse(req.params.id);
  const target = await findTarget(user.organizationId, id);
  if (target.id === user.id) throw new AppError(400, 'Você não pode excluir a sua própria conta.');
  if (target.role === 'owner') throw new AppError(403, 'A conta principal não pode ser excluída.', 'FORBIDDEN');
  await query('delete from users where id = $1', [id]);
  // Páginas do vendedor excluído ficam sem responsável (on delete set null): redistribui
  if (target.role === 'seller') await distributeUnassignedPages(user.organizationId);
  res.json({ ok: true });
});

async function findTarget(orgId: string, id: string) {
  const target = await one<{ id: string; role: string; email: string }>("select id, role, email from users where id = $1 and organization_id = $2 and role <> 'client'", [id, orgId]);
  if (!target) throw notFound('Usuário não encontrado.');
  return target;
}

async function ensureEmailFree(email: string) {
  const taken = await one('select 1 from users where lower(email) = $1', [email]);
  if (taken) throw new AppError(409, 'Já existe uma conta com este e-mail.', 'CONFLICT');
}
