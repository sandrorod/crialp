import { one, query } from '../../db/pool.js';
import { waitUntil } from '@vercel/functions';
import { env } from '../../config/env.js';
import { AppError, Messages } from '../../lib/errors.js';

export type JobType = 'analyze_url' | 'generate_landing_page';

export interface JobRow {
  id: string;
  organization_id: string;
  type: JobType;
  status: 'queued' | 'running' | 'done' | 'error';
  step: number;
  input: any;
  result: any;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const CANCELED_MESSAGE = 'Processamento interrompido pelo usuário.';

/** O processamento foi interrompido pelo usuário: a tarefa para na próxima etapa, sem salvar nada. */
class JobCanceled extends Error {}

export interface JobHandle {
  id: string;
  step(n: number): Promise<void>;
}

/**
 * Executor de tarefas em processo. A interface (create/get/step) permite trocar
 * futuramente por uma fila dedicada (BullMQ, pg-boss, SQS) sem alterar as rotas.
 */
export class JobService {
  async create(orgId: string, type: JobType, input: object) {
    const row = await one<{ id: string }>(
      `insert into jobs (organization_id, type, input) values ($1, $2, $3) returning id`,
      [orgId, type, JSON.stringify(input)],
    );
    return row!.id;
  }

  get(orgId: string, id: string) {
    return one<JobRow>('select * from jobs where id = $1 and organization_id = $2', [id, orgId]);
  }

  /** Inicia a execução em segundo plano; a interface acompanha via GET /api/jobs/:id. */
  run(id: string, fn: (job: JobHandle) => Promise<unknown>) {
    const handle: JobHandle = {
      id,
      // Cada etapa confere se o usuário interrompeu; se sim, a tarefa para aqui
      step: async (n) => {
        const res = await query(`update jobs set step = $2, status = 'running' where id = $1 and status <> 'error'`, [id, n]);
        if (!res.rowCount) throw new JobCanceled();
      },
    };
    const task = (async () => {
      try {
        await query(`update jobs set status = 'running' where id = $1 and status <> 'error'`, [id]);
        const result = await fn(handle);
        await query(`update jobs set status = 'done', result = $2 where id = $1 and status <> 'error'`, [id, JSON.stringify(result ?? null)]);
      } catch (err) {
        if (err instanceof JobCanceled) return;
        const message = err instanceof AppError ? err.message : Messages.aiFailed;
        if (!(err instanceof AppError)) console.error(`[job ${id}]`, err);
        await query(`update jobs set status = 'error', error = $2 where id = $1 and status <> 'error'`, [id, message]).catch(() => {});
      }
    })();
    // No Vercel a função continua viva até a tarefa terminar, mesmo após a resposta
    if (env.isVercel) waitUntil(task);
  }

  /** Interrompe um processamento em andamento (a tarefa para na próxima etapa, sem salvar). */
  async cancel(orgId: string, id: string) {
    const res = await query(
      `update jobs set status = 'error', error = $3 where id = $1 and organization_id = $2 and status in ('queued','running')`,
      [id, orgId, CANCELED_MESSAGE],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Tarefas paradas há mais de 10 min (instância encerrada) viram erro. Seguro em várias instâncias. */
  async failStale() {
    await query(
      `update jobs set status = 'error', error = 'Processamento interrompido. Tente novamente.'
        where status in ('queued','running') and updated_at < now() - interval '10 minutes'`,
    );
    await query(`delete from jobs where created_at < now() - interval '7 days'`);
  }

  /** Tarefas interrompidas por reinício do servidor não ficam "rodando" para sempre. */
  async failInterrupted() {
    await query(
      `update jobs set status = 'error', error = 'Processamento interrompido. Tente novamente.' where status in ('queued','running')`,
    );
    await query(`delete from jobs where created_at < now() - interval '7 days'`);
  }
}

export const jobService = new JobService();
