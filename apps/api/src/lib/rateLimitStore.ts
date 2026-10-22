import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { one, query } from '../db/pool.js';

/**
 * Contador do express-rate-limit no Postgres: o mesmo para todas as instâncias (na Vercel cada
 * instância tinha o seu, em memória, e o limite real se multiplicava pelo número de instâncias).
 * `prefix` separa os limites (login, upload…), que usam a mesma chave (o IP).
 */
export class PgRateLimitStore implements Store {
  windowMs = 60_000;
  localKeys = false;

  constructor(readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private k(key: string) {
    return `${this.prefix}:${key}`.slice(0, 300);
  }

  async increment(key: string): Promise<IncrementResponse> {
    // Janela vencida recomeça do 1; senão soma
    const row = await one<{ hits: number; reset_at: Date }>(
      `insert into lp_rate_limits (key, hits, reset_at) values ($1, 1, now() + $2 * interval '1 millisecond')
       on conflict (key) do update set
         hits = case when lp_rate_limits.reset_at <= now() then 1 else lp_rate_limits.hits + 1 end,
         reset_at = case when lp_rate_limits.reset_at <= now() then excluded.reset_at else lp_rate_limits.reset_at end
       returning hits, reset_at`,
      [this.k(key), this.windowMs],
    );
    // Limpeza ocasional das janelas vencidas (sem tarefa agendada)
    if (Math.random() < 0.01) void query(`delete from lp_rate_limits where reset_at < now() - interval '1 day'`).catch(() => {});
    return { totalHits: row!.hits, resetTime: new Date(row!.reset_at) };
  }

  async decrement(key: string) {
    await query('update lp_rate_limits set hits = greatest(hits - 1, 0) where key = $1', [this.k(key)]);
  }

  async resetKey(key: string) {
    await query('delete from lp_rate_limits where key = $1', [this.k(key)]);
  }
}
