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

/**
 * Geração da primeira LP de uma empresa que terminou em erro: a empresa fica marcada ("Erro ao gerar")
 * até uma geração dar certo. Regeneração com erro não marca (a LP anterior continua valendo).
 * `failed` = CTE/consulta com id, type, input e error dos processamentos que falharam.
 */
const MARK_LP_ERROR = (failed: string) => `
  update companies c set lp_error = f.error, lp_error_at = now()
    from (${failed}) f
   where f.type = 'generate_landing_page' and f.input->>'landingPageId' is null and c.id::text = f.input->>'companyId'`;

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
        // Gerou: tira a marca de erro da empresa
        await query(
          `update companies c set lp_error = null, lp_error_at = null from jobs j
            where j.id = $1 and j.type = 'generate_landing_page' and c.id::text = j.input->>'companyId' and c.lp_error is not null`,
          [id],
        ).catch(() => {});
      } catch (err) {
        if (err instanceof JobCanceled) return;
        const message = err instanceof AppError ? err.message : Messages.aiFailed;
        if (!(err instanceof AppError)) console.error(`[job ${id}]`, err);
        await query(`update jobs set status = 'error', error = $2 where id = $1 and status <> 'error'`, [id, message]).catch(() => {});
        await query(MARK_LP_ERROR('select id, type, input, error from jobs where id = $1'), [id]).catch(() => {});
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
    // Geração que parou no meio (instância encerrada, tempo esgotado) também marca a empresa
    await query(
      `with failed as (
         update jobs set status = 'error', error = 'Processamento interrompido. Tente novamente.'
          where status in ('queued','running') and updated_at < now() - interval '10 minutes'
          returning id, type, input, error
       )${MARK_LP_ERROR('select * from failed')}`,
    );
    await query(`delete from jobs where created_at < now() - interval '7 days'`);
  }

  /** Tarefas interrompidas por reinício do servidor não ficam "rodando" para sempre. */
  async failInterrupted() {
    await query(
      `with failed as (
         update jobs set status = 'error', error = 'Processamento interrompido. Tente novamente.' where status in ('queued','running')
          returning id, type, input, error
       )${MARK_LP_ERROR('select * from failed')}`,
    );
    await query(`delete from jobs where created_at < now() - interval '7 days'`);
  }
}

export const jobService = new JobService();
