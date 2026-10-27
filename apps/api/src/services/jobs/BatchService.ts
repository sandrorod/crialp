import { createHmac, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { AppError, Messages } from '../../lib/errors.js';
import { normalizeInputUrl } from '../../lib/url.js';
import { CompanyInputSchema } from '../../lib/validation.js';
import { findDuplicateCompany } from '../../repositories/companies.js';
import { aiService } from '../ai/index.js';
import { analyzeUrl } from '../pipeline/analyzeUrl.js';
import { generateLanding } from '../pipeline/generateLanding.js';
import { registerCompany } from '../pipeline/registerCompany.js';
import { jobService } from './JobService.js';

/** Local do Google Maps escolhido em "Buscar empresas" (dados já obtidos na pesquisa). */
export interface BatchPlace {
  name: string;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
  photos?: string[] | null;
  place_id?: string | null;
  google_url?: string | null;
}

export interface BatchItem {
  url: string;
  name: string;
  place?: BatchPlace | null;
}

export interface BatchResult {
  status: 'ok' | 'error' | 'skipped';
  error?: string;
  companyId?: string;
  landingPageId?: string;
}

export interface BatchRow {
  id: string;
  organization_id: string;
  user_id: string;
  items: BatchItem[];
  fotos: boolean;
  gap_minutes: number;
  status: 'running' | 'paused' | 'canceled' | 'done';
  stage: 'wait' | 'analyze' | 'generate';
  idx: number;
  ok: number;
  results: BatchResult[];
  job_id: string | null;
  company_id: string | null;
  next_at: string;
  paused_left: number | null;
  wake_at: string | null;
  created_at: string;
  updated_at: string;
}

/** No Vercel uma função vive no máximo 300 s: a espera do intervalo vai em trechos menores, cada um numa chamada nova. */
const MAX_SLEEP_MS = 240_000;
export const GAP_MAX = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Token da chamada interna que continua o lote (o servidor chama a si mesmo). */
export function tickToken(id: string) {
  return createHmac('sha256', env.jwtSecret).update(`lp-batch-tick:${id}`).digest('base64url');
}

export function validTickToken(id: string, token: string | undefined) {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(tickToken(id));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Lote de LPs tocado pelo servidor: análise → cadastro → geração de cada empresa, com o intervalo
 * escolhido entre uma LP e a próxima. Cada processamento que termina chama o próximo passo, então
 * o lote segue com a aba do navegador em segundo plano ou fechada.
 */
export class BatchService {
  /** Etapas do pipeline (trocadas nos testes por versões sem IA). */
  constructor(
    private readonly pipeline = {
      analyze: analyzeUrl,
      generate: generateLanding,
      aiConfigured: () => aiService.isConfigured(),
    },
  ) {}

  async create(orgId: string, userId: string, items: BatchItem[], fotos: boolean, gapMinutes: number) {
    const row = await one<{ id: string }>(
      `insert into lp_batches (organization_id, user_id, items, fotos, gap_minutes) values ($1, $2, $3, $4, $5) returning id`,
      [orgId, userId, JSON.stringify(items), fotos, gapMinutes],
    );
    this.kick(row!.id);
    return row!.id;
  }

  get(orgId: string, id: string) {
    return one<BatchRow>('select * from lp_batches where id = $1 and organization_id = $2', [id, orgId]);
  }

  /** Lote em andamento (ou pausado) mais recente da organização, para a tela retomar o acompanhamento. */
  active(orgId: string) {
    return one<BatchRow>(`select * from lp_batches where organization_id = $1 and status in ('running', 'paused') order by created_at desc limit 1`, [orgId]);
  }

  /**
   * Continua o lote numa execução nova, depois de `delayMs`. No Vercel, o servidor chama a própria
   * rota interna (cada chamada tem o tempo dela); no servidor contínuo, basta um timer.
   */
  kick(id: string, delayMs = 0) {
    const wait = Math.max(0, Math.min(delayMs, MAX_SLEEP_MS));
    if (!env.isVercel) {
      // unref: a espera não segura o processo aberto sozinha (o servidor já o mantém vivo)
      setTimeout(() => void this.tick(id).catch((err) => console.error(`[lote ${id}]`, err)), wait).unref();
      return;
    }
    waitUntil(
      (async () => {
        if (wait) await sleep(wait);
        const res = await fetch(`${env.appUrl}/api/lp-batches/${id}/tick`, {
          method: 'POST',
          headers: { 'x-batch-token': tickToken(id) },
          signal: AbortSignal.timeout(30_000),
        }).catch((err: unknown) => {
          console.error(`[lote ${id}] tick`, err);
          return null;
        });
        if (res && !res.ok) console.error(`[lote ${id}] tick respondeu ${res.status}`);
      })(),
    );
  }

  /** Continuação chamada pelo próprio servidor: com o lote ocupado por outra chamada, tenta de novo em 10 s. */
  async tick(id: string) {
    if ((await this.advance(id)) === 'busy') this.kick(id, 10_000);
  }

  /**
   * Avança o lote o quanto der agora (no máximo uma empresa começada por chamada) e agenda a continuação do
   * intervalo. Uma chamada por vez em cada lote (reserva de 2 min), então chamadas repetidas não duplicam nada.
   */
  async advance(id: string): Promise<'busy' | undefined> {
    let b = await one<BatchRow>(
      `update lp_batches set lease_until = now() + interval '2 minutes'
        where id = $1 and status in ('running', 'paused') and (lease_until is null or lease_until < now())
        returning *`,
      [id],
    );
    if (!b) {
      const exists = await one('select 1 from lp_batches where id = $1 and status in ($2, $3)', [id, 'running', 'paused']);
      return exists ? 'busy' : undefined;
    }
    try {
      for (let guard = 0; guard < 6 && b; guard++) {
        if (b.stage === 'analyze' || b.stage === 'generate') {
          const job = b.job_id ? await jobService.get(b.organization_id, b.job_id) : null;
          // Em andamento: o fim do processamento chama de novo (parado há mais de 10 min = instância encerrada)
          const stale = job && Date.now() - new Date(job.updated_at).getTime() > 10 * 60_000;
          if (job && (job.status === 'queued' || job.status === 'running') && !stale) return;
          if (job && stale && job.status !== 'done' && job.status !== 'error') {
            await jobService.cancel(b.organization_id, job.id);
            b = await this.finishItem(b, { status: 'error', error: 'Processamento interrompido. Tente novamente.', companyId: b.company_id ?? undefined });
            continue;
          }
          if (!job || job.status === 'error') {
            b = await this.finishItem(b, { status: 'error', error: job?.error ?? 'Processamento não encontrado.', companyId: b.company_id ?? undefined });
            continue;
          }
          if (b.stage === 'analyze') b = await this.startGeneration(b, job.result);
          else {
            const landingPageId = (job.result as { landingPageId?: string } | null)?.landingPageId;
            b = await this.finishItem(b, { status: 'ok', companyId: b.company_id ?? undefined, landingPageId });
          }
          continue;
        }
        // Esperando o intervalo para começar a próxima empresa
        if (b.status !== 'running') return;
        const left = new Date(b.next_at).getTime() - Date.now();
        if (left > 0) {
          await this.scheduleWake(b, left);
          return;
        }
        b = await this.startAnalysis(b);
      }
    } finally {
      await query('update lp_batches set lease_until = null where id = $1', [id]).catch(() => {});
    }
  }

  /** Agenda uma continuação para quando o intervalo acabar, se ainda não houver uma marcada para antes disso. */
  private async scheduleWake(b: BatchRow, leftMs: number) {
    const wait = Math.min(leftMs, MAX_SLEEP_MS);
    const res = await query(
      `update lp_batches set wake_at = now() + ($2 || ' milliseconds')::interval
        where id = $1 and (wake_at is null or wake_at <= now() or wake_at > now() + ($2 || ' milliseconds')::interval + interval '5 seconds')`,
      [b.id, String(wait)],
    );
    if (res.rowCount) this.kick(b.id, wait + 500);
  }

  private async save(b: BatchRow, fields: Partial<Pick<BatchRow, 'stage' | 'idx' | 'ok' | 'results' | 'job_id' | 'company_id' | 'status' | 'next_at'>>) {
    const cols = Object.keys(fields) as (keyof typeof fields)[];
    const values = cols.map((c) => (c === 'results' ? JSON.stringify(fields[c]) : fields[c]));
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
    return (await one<BatchRow>(`update lp_batches set ${set}, updated_at = now() where id = $1 returning *`, [b.id, ...values]))!;
  }

  /** Começa a empresa atual: análise do link (link recusado ou já cadastrado vira erro e passa para a próxima). */
  private async startAnalysis(b: BatchRow) {
    const item = b.items[b.idx];
    try {
      const parsed = normalizeInputUrl(item.url);
      const dup = await findDuplicateCompany(b.organization_id, { url: parsed.toString() });
      if (dup) throw new AppError(409, `Esta empresa já foi cadastrada: "${dup.name}" (mesmo link).`, 'DUPLICATE_COMPANY');
      if (!(await this.pipeline.aiConfigured())) throw new AppError(503, Messages.aiNotConfigured);
      const jobId = await jobService.create(b.organization_id, 'analyze_url', { url: parsed.toString(), batchId: b.id });
      const saved = await this.save(b, { stage: 'analyze', job_id: jobId, company_id: null });
      jobService.run(
        jobId,
        (job) => this.pipeline.analyze(job, parsed, { allowImages: b.fotos, place: item.place ?? undefined }),
        () => this.kick(b.id),
      );
      return saved;
    } catch (err) {
      return this.finishItem(b, { status: 'error', error: err instanceof AppError ? err.message : Messages.aiFailed });
    }
  }

  /** Análise concluída: cadastra a empresa com os dados lidos (como o "Confirmar" da revisão) e gera a LP. */
  private async startGeneration(b: BatchRow, result: unknown) {
    const r = (result ?? {}) as { draft?: Record<string, unknown>; meta?: object };
    try {
      const d = (r.draft ?? {}) as Record<string, unknown> & {
        services?: { name: string }[];
        products?: { name: string }[];
        testimonials?: { text: string }[];
        other_socials?: { url: string }[];
      };
      const input = CompanyInputSchema.parse({
        ...d,
        services: (d.services ?? []).filter((s) => s.name?.trim()),
        products: (d.products ?? []).filter((p) => p.name?.trim()),
        testimonials: (d.testimonials ?? []).filter((t) => t.text?.trim()),
        other_socials: (d.other_socials ?? []).filter((s) => s.url?.trim()),
      });
      const companyId = await registerCompany(b.organization_id, b.user_id, input, r.meta ?? {}, b.job_id ?? undefined);
      // Vendedor em rodízio, como o padrão "Aleatório" da revisão
      const body = { companyId, sellerId: 'auto' as const };
      const jobId = await jobService.create(b.organization_id, 'generate_landing_page', { ...body, batchId: b.id });
      const saved = await this.save(b, { stage: 'generate', job_id: jobId, company_id: companyId });
      jobService.run(
        jobId,
        (job) => this.pipeline.generate(job, { orgId: b.organization_id, userId: b.user_id, ...body }),
        () => this.kick(b.id),
      );
      return saved;
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Os dados lidos do site não puderam ser cadastrados.';
      if (!(err instanceof AppError)) console.error(`[lote ${b.id}] cadastro`, err);
      return this.finishItem(b, { status: 'error', error: message });
    }
  }

  /** Registra o resultado da empresa atual e passa para a próxima (depois do intervalo, se gerou a LP). */
  private async finishItem(b: BatchRow, result: BatchResult) {
    const results = [...b.results];
    results[b.idx] = result;
    const idx = b.idx + 1;
    const ok = b.ok + (result.status === 'ok' ? 1 : 0);
    if (idx >= b.items.length) return this.save(b, { results, idx, ok, stage: 'wait', job_id: null, status: 'done' });
    const gapMs = result.status === 'ok' ? b.gap_minutes * 60_000 : 0;
    return this.save(b, { results, idx, ok, stage: 'wait', job_id: null, next_at: new Date(Date.now() + gapMs).toISOString() });
  }

  /** Botões da tela do lote. Devolve o lote atualizado (null = não encontrado). */
  async action(orgId: string, id: string, action: 'pause' | 'resume' | 'now' | 'skip' | 'cancel' | 'gap', gapMinutes?: number) {
    const b = await this.get(orgId, id);
    if (!b) return null;
    if (b.status === 'done' || b.status === 'canceled') return b;
    switch (action) {
      case 'pause':
        // Pausa a contagem: a empresa em andamento termina, mas a próxima só começa ao continuar
        await query(
          `update lp_batches set status = 'paused', paused_left = greatest(0, ceil(extract(epoch from (next_at - now()))))::int, updated_at = now()
            where id = $1 and status = 'running'`,
          [id],
        );
        break;
      case 'resume':
        await query(
          `update lp_batches set status = 'running', next_at = now() + make_interval(secs => coalesce(paused_left, 0)), paused_left = null,
                  wake_at = null, updated_at = now()
            where id = $1 and status = 'paused'`,
          [id],
        );
        break;
      case 'now':
        await query(`update lp_batches set status = 'running', next_at = now(), paused_left = null, wake_at = null, updated_at = now() where id = $1`, [id]);
        break;
      case 'skip': {
        // Deixa a empresa atual sem LP: interrompe a análise/geração e passa para a próxima
        const current = await one<BatchRow>(
          `update lp_batches set lease_until = now() + interval '2 minutes'
            where id = $1 and stage in ('analyze', 'generate') and (lease_until is null or lease_until < now()) returning *`,
          [id],
        );
        if (current) {
          try {
            if (current.job_id) await jobService.cancel(orgId, current.job_id);
            await this.finishItem(current, { status: 'skipped', companyId: current.company_id ?? undefined });
          } finally {
            await query('update lp_batches set lease_until = null where id = $1', [id]);
          }
        }
        break;
      }
      case 'cancel':
        // Para o lote; a empresa em andamento termina por conta própria (a LP gerada continua valendo)
        await query(`update lp_batches set status = 'canceled', updated_at = now() where id = $1`, [id]);
        break;
      case 'gap': {
        const v = Math.min(GAP_MAX, Math.max(0, Math.round(gapMinutes ?? b.gap_minutes)));
        // Durante a espera, o tempo que falta acompanha a mudança
        await query(
          `update lp_batches set gap_minutes = $2,
                  next_at = case when stage = 'wait' and next_at > now() then greatest(now(), next_at + make_interval(mins => $2 - gap_minutes)) else next_at end,
                  paused_left = case when paused_left is null then null else greatest(0, paused_left + ($2 - gap_minutes) * 60) end,
                  wake_at = null, updated_at = now()
            where id = $1`,
          [id, v],
        );
        break;
      }
    }
    if (action !== 'pause' && action !== 'cancel') this.kick(id);
    return this.get(orgId, id);
  }
}

export const batchService = new BatchService();
