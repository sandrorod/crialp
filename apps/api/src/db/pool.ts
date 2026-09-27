import pg from 'pg';
import { env } from '../config/env.js';

// Todas as consultas usam parâmetros ($1, $2...) — nunca concatenação de strings.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  // Em funções serverless cada instância abre poucas conexões (use o pooler do Supabase)
  max: env.isVercel ? 3 : 10,
  idleTimeoutMillis: env.isVercel ? 10_000 : 30_000,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  const { rows } = await pool.query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
