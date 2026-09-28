import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';

/**
 * Chaves de API da IA cadastradas pelo painel, com rodízio: cada uso pega a próxima
 * chave da fila (contador no banco, compartilhado entre as instâncias do servidor).
 * A chave da variável de ambiente, se existir, também participa do rodízio.
 */

export interface AIKey {
  /** null = chave da variável de ambiente */
  id: string | null;
  key: string;
  label: string;
}

export interface AIKeyInfo {
  id: string;
  label: string | null;
  last4: string;
  active: boolean;
  uses: number;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
}

// Criptografia simétrica derivada do segredo do servidor
function cipherKey() {
  return crypto.createHash('sha256').update(`lp-ai-keys:${env.jwtSecret}`).digest();
}

function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null; // segredo do servidor mudou: a chave precisa ser cadastrada de novo
  }
}

const hashKey = (key: string) => crypto.createHash('sha256').update(key.trim()).digest('hex');

export const aiKeyStore = {
  async list(provider = 'gemini'): Promise<AIKeyInfo[]> {
    const { rows } = await query<AIKeyInfo>(
      `select id, label, last4, active, uses::int as uses, last_used_at, last_error, last_error_at, created_at
         from ai_api_keys where provider = $1 order by created_at`,
      [provider],
    );
    return rows;
  },

  async exists(key: string) {
    return !!(await one('select 1 from ai_api_keys where key_hash = $1', [hashKey(key)]));
  },

  async add(input: { key: string; label?: string | null; userId?: string }, provider = 'gemini'): Promise<AIKeyInfo> {
    const key = input.key.trim();
    const row = await one<AIKeyInfo>(
      `insert into ai_api_keys (provider, label, key_encrypted, key_hash, last4, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, label, last4, active, uses::int as uses, last_used_at, last_error, last_error_at, created_at`,
      [provider, input.label?.trim() || null, encrypt(key), hashKey(key), key.slice(-4), input.userId ?? null],
    );
    return row!;
  },

  async update(id: string, patch: { active?: boolean; label?: string | null }) {
    const { rowCount } = await query(
      `update ai_api_keys set active = coalesce($2, active), label = case when $3::boolean then $4 else label end where id = $1`,
      [id, patch.active ?? null, patch.label !== undefined, patch.label?.trim() || null],
    );
    return !!rowCount;
  },

  async remove(id: string) {
    const { rowCount } = await query('delete from ai_api_keys where id = $1', [id]);
    return !!rowCount;
  },

  /** Há alguma chave utilizável (ambiente ou banco ativa)? */
  async hasAny(provider = 'gemini', envKey?: string) {
    if (envKey) return true;
    return !!(await one('select 1 from ai_api_keys where provider = $1 and active limit 1', [provider]));
  },

  /**
   * Chaves na ordem de uso desta chamada: começa pela próxima do rodízio e segue as demais
   * (usadas só se a anterior falhar por cota ou chave inválida).
   */
  async rotation(provider = 'gemini', envKey?: string): Promise<AIKey[]> {
    const { rows } = await query<{ id: string; label: string | null; last4: string; key_encrypted: string }>(
      'select id, label, last4, key_encrypted from ai_api_keys where provider = $1 and active order by created_at',
      [provider],
    );
    const keys: AIKey[] = [];
    if (envKey) keys.push({ id: null, key: envKey, label: 'variável de ambiente' });
    for (const r of rows) {
      const key = decrypt(r.key_encrypted);
      if (key) keys.push({ id: r.id, key, label: r.label || `•••• ${r.last4}` });
      else await this.recordError(r.id, 'Não foi possível ler a chave (o segredo do servidor mudou). Cadastre-a novamente.');
    }
    if (keys.length <= 1) return keys;
    const counter = await one<{ counter: string }>(
      `insert into ai_key_rotation (provider, counter) values ($1, 1)
       on conflict (provider) do update set counter = ai_key_rotation.counter + 1
       returning counter`,
      [provider],
    );
    const start = (Number(counter?.counter ?? 1) - 1) % keys.length;
    return [...keys.slice(start), ...keys.slice(0, start)];
  },

  async recordUse(id: string | null) {
    if (!id) return;
    await query('update ai_api_keys set uses = uses + 1, last_used_at = now() where id = $1', [id]).catch(() => {});
  },

  async recordError(id: string | null, message: string) {
    if (!id) return;
    await query('update ai_api_keys set last_error = $2, last_error_at = now() where id = $1', [id, message.slice(0, 500)]).catch(() => {});
  },

  async clearError(id: string | null) {
    if (!id) return;
    await query('update ai_api_keys set last_error = null, last_error_at = null where id = $1', [id]).catch(() => {});
  },
};
