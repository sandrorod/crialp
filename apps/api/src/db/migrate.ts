import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/db ou dist/db → raiz do monorepo/database/migrations (no Vercel, MIGRATIONS_DIR aponta para a cópia na função)
const defaultMigrationsDir = path.resolve(here, '../../../../database/migrations');

export async function runMigrations(log = console.log) {
  const migrationsDir = process.env.MIGRATIONS_DIR ?? defaultMigrationsDir;
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    // Trava por transação (não por sessão): funciona também no transaction pooler do Supabase (porta 6543)
    for (const file of files) {
      await client.query('begin');
      try {
        await client.query('select pg_advisory_xact_lock(727274)');
        await client.query(`create table if not exists schema_migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )`);
        const { rowCount } = await client.query('select 1 from schema_migrations where name = $1', [file]);
        if (rowCount) {
          await client.query('commit');
          continue;
        }
        const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
        log(`[migrate] aplicando ${file}`);
        await client.query(sql);
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

// Execução direta: npm run migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log('[migrate] concluído');
      return pool.end();
    })
    .catch((err) => {
      console.error('[migrate] falhou:', err);
      process.exit(1);
    });
}
