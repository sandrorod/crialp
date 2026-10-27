import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db/pool.js';
import { AppError } from '../src/lib/errors.js';
import { BatchService, type BatchRow } from '../src/services/jobs/BatchService.js';
import { closeDb, resetDb, seed } from './helpers.js';

/**
 * Lote de LPs no servidor: cada empresa é analisada, cadastrada e gerada sem a tela participar
 * (a aba do navegador pode estar em segundo plano ou fechada). Análise e geração aqui são falsas (sem IA).
 */
let s: Awaited<ReturnType<typeof seed>>;
const generated: string[] = [];

const batches = new BatchService({
  analyze: async (job, url) => {
    await job.step(1);
    await new Promise((r) => setTimeout(r, url.hostname.startsWith('lento') ? 600 : 20));
    if (url.hostname.startsWith('falha')) throw new AppError(422, 'Site fora do ar.');
    return { draft: { name: `Empresa ${url.hostname}`, reference_url: url.toString() }, meta: { final_url: url.toString() } };
  },
  generate: async (job, opts) => {
    await job.step(1);
    generated.push(opts.companyId);
    return { landingPageId: '00000000-0000-4000-8000-000000000001' };
  },
  aiConfigured: async () => true,
});

/** Espera o lote chegar à condição (o servidor avança sozinho, por timers). */
async function until(id: string, done: (b: BatchRow) => boolean, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const b = (await batches.get(s.orgA, id))!;
    if (done(b)) return b;
    if (Date.now() > end) throw new Error(`lote não chegou ao estado esperado: ${JSON.stringify({ status: b.status, stage: b.stage, idx: b.idx })}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

before(async () => {
  await resetDb();
  s = await seed();
});
after(async () => {
  await closeDb();
});

describe('Lote de LPs no servidor', () => {
  it('gera uma empresa depois da outra sozinho; erros passam para a próxima', async () => {
    const id = await batches.create(
      s.orgA,
      s.ownerA,
      [
        { url: 'https://padaria-um.com.br', name: 'Padaria Um' },
        { url: 'https://falha.com.br', name: 'Falha' },
        { url: 'https://oficina-dois.com.br', name: 'Oficina Dois' },
      ],
      false,
      0,
    );
    const b = await until(id, (x) => x.status === 'done');
    assert.equal(b.ok, 2);
    assert.deepEqual(
      b.results.map((r) => r.status),
      ['ok', 'error', 'ok'],
    );
    assert.equal(b.results[1].error, 'Site fora do ar.');
    assert.equal(generated.length, 2);
    // Empresas cadastradas com os dados lidos
    const names = (await query<{ name: string }>('select name from companies where id = any($1) order by name', [generated])).rows.map((r) => r.name);
    assert.deepEqual(names, ['Empresa oficina-dois.com.br', 'Empresa padaria-um.com.br']);
  });

  it('empresa já cadastrada (mesmo link) vira erro sem gastar análise', async () => {
    const id = await batches.create(s.orgA, s.ownerA, [{ url: 'https://padaria-um.com.br', name: 'Padaria Um de novo' }], false, 0);
    const b = await until(id, (x) => x.status === 'done');
    assert.equal(b.results[0].status, 'error');
    assert.match(b.results[0].error ?? '', /já foi cadastrada/);
  });

  it('respeita o intervalo entre as LPs; pausar segura a próxima e "começar agora" segue', async () => {
    const id = await batches.create(
      s.orgA,
      s.ownerA,
      [
        { url: 'https://tres.com.br', name: 'Três' },
        { url: 'https://quatro.com.br', name: 'Quatro' },
      ],
      false,
      5,
    );
    // Primeira gerada: espera os 5 minutos antes da segunda
    let b = await until(id, (x) => x.idx === 1 && x.stage === 'wait');
    const left = new Date(b.next_at).getTime() - Date.now();
    assert.ok(left > 4 * 60_000 && left <= 5 * 60_000, `intervalo: ${left} ms`);
    b = (await batches.action(s.orgA, id, 'pause'))!;
    assert.equal(b.status, 'paused');
    assert.ok((b.paused_left ?? 0) > 4 * 60);
    // Diminuir o intervalo durante a pausa desconta do que falta
    b = (await batches.action(s.orgA, id, 'gap', 2))!;
    assert.equal(b.gap_minutes, 2);
    assert.ok((b.paused_left ?? 0) <= 2 * 60 && (b.paused_left ?? 0) > 60);
    b = (await batches.action(s.orgA, id, 'now'))!;
    b = await until(id, (x) => x.status === 'done');
    assert.equal(b.ok, 2);
  });

  it('pular deixa a empresa atual sem LP e segue para a próxima', async () => {
    const id = await batches.create(
      s.orgA,
      s.ownerA,
      [
        { url: 'https://lento.com.br', name: 'Lento' },
        { url: 'https://seis.com.br', name: 'Seis' },
      ],
      false,
      30,
    );
    await until(id, (x) => x.stage === 'analyze');
    await batches.action(s.orgA, id, 'skip');
    const b = await until(id, (x) => x.status === 'done');
    assert.deepEqual(
      b.results.map((r) => r.status),
      ['skipped', 'ok'],
    );
    // A análise interrompida não cadastra a empresa
    assert.equal((await query(`select 1 from companies where name = 'Empresa lento.com.br'`)).rowCount, 0);
  });

  it('parar encerra o lote (mesmo com a análise em andamento) e só a organização dona o vê', async () => {
    const id = await batches.create(
      s.orgA,
      s.ownerA,
      [
        { url: 'https://lento-dois.com.br', name: 'Lento dois' },
        { url: 'https://sete.com.br', name: 'Sete' },
      ],
      false,
      0,
    );
    await until(id, (x) => x.stage === 'analyze');
    assert.equal((await batches.action(s.orgA, id, 'cancel'))!.status, 'canceled');
    await new Promise((r) => setTimeout(r, 900));
    const b = (await batches.get(s.orgA, id))!;
    assert.equal(b.status, 'canceled');
    assert.equal(b.idx, 0);
    assert.equal(await batches.active(s.orgA), null);
    assert.equal(await batches.get(s.orgB, id), null);
  });
});
