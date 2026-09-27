import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { one, transaction } from './pool.js';

/** Cria a organização e o administrador inicial se ainda não existir nenhum usuário. */
export async function ensureAdmin(log = console.log) {
  const existing = await one<{ count: string }>('select count(*)::text as count from users');
  if (existing && Number(existing.count) > 0) return;

  const { email, password, name } = env.admin;
  if (!email || !password) {
    log('[bootstrap] nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador.');
    return;
  }
  if (password.length < 8) throw new Error('ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');

  const hash = await bcrypt.hash(password, 12);
  await transaction(async (db) => {
    const org = await db.query<{ id: string }>(`insert into organizations (name) values ($1) returning id`, ['Principal']);
    await db.query(
      `insert into users (organization_id, name, email, password_hash, role) values ($1, $2, $3, $4, 'owner')`,
      [org.rows[0].id, name, email.toLowerCase(), hash],
    );
  });
  log(`[bootstrap] administrador criado: ${email}`);
}
