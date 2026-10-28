import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, ErrorBlock, LoadingBlock, Select } from '@/components/ui';
import { CrmBar } from '@/components/crm/CrmTheme';
import { useAsync } from '@/hooks/useAsync';
import { crmService, type MessagesReport } from '@/services/crm';

/** Datas no fuso de Brasília (o servidor conta os dias no mesmo fuso). */
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (month: string, n: number) => {
  const d = new Date(`${month}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const lastDayOf = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1);
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Períodos: 7 e 30 dias, cada um dos últimos 12 meses (por dia) e os últimos 3 anos (por mês). */
function periodOptions() {
  const today = ymd(new Date());
  const thisMonth = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  return [
    { id: '7', label: 'Últimos 7 dias' },
    { id: '30', label: 'Últimos 30 dias' },
    ...Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(thisMonth, -i);
      return { id: `month:${m}`, label: `Mês: ${monthName(m)}` };
    }),
    ...[0, 1, 2].map((i) => ({ id: `year:${year - i}`, label: `Ano: ${year - i}` })),
  ];
}

function range(id: string): { from: string; to: string; group: 'day' | 'month' } {
  const today = ymd(new Date());
  if (id === '7') return { from: addDays(today, -6), to: today, group: 'day' };
  if (id === '30') return { from: addDays(today, -29), to: today, group: 'day' };
  if (id.startsWith('month:')) {
    const m = id.slice(6);
    const end = lastDayOf(m);
    return { from: `${m}-01`, to: end < today ? end : today, group: 'day' };
  }
  const y = id.slice(5);
  const end = `${y}-12-31`;
  return { from: `${y}-01-01`, to: end < today ? end : today, group: 'month' };
}

const NO_SELLER = 'sem';
type Col = { id: string; name: string };

/** Tabela período × vendedor (dias ou meses nas linhas), com totais. */
function PeriodTable({
  title,
  cols,
  keys,
  count,
  label,
}: {
  title: string;
  cols: Col[];
  keys: string[];
  count: Map<string, number>;
  label: (k: string) => string;
}) {
  const colTotal = (c: Col) => keys.reduce((n, k) => n + (count.get(`${k}|${c.id}`) ?? 0), 0);
  const grand = cols.reduce((n, c) => n + colTotal(c), 0);
  return (
    <Section title={title}>
      {!grand ? (
        <p className="px-4 pb-4 text-sm text-zinc-500">Nenhuma mensagem neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Período</th>
                {cols.map((c) => (
                  <th key={c.id} className="px-3 py-3 text-right font-medium">
                    {c.name}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const rowTotal = cols.reduce((n, c) => n + (count.get(`${k}|${c.id}`) ?? 0), 0);
                return (
                  <tr key={k} className="border-b border-zinc-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">{label(k)}</td>
                    {cols.map((c) => {
                      const n = count.get(`${k}|${c.id}`) ?? 0;
                      return (
                        <td key={c.id} className={`px-3 py-2.5 text-right tabular-nums ${n ? 'text-ink' : 'text-zinc-300'}`}>
                          {n}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                {cols.map((c) => (
                  <td key={c.id} className="px-3 py-3 text-right tabular-nums">
                    {colTotal(c)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{grand}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="border-t border-zinc-100 first:border-t-0">
      <h2 className="px-4 pb-2 pt-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
      {note ? <p className="px-4 pb-4 text-xs text-zinc-500">{note}</p> : null}
    </section>
  );
}

/**
 * Relatório (gerência): mensagens enviadas e recebidas por vendedor (por dia ou, no ano, por mês), clientes
 * contatados (novos e que já tinham contato) e mensagens de cada cliente. Pelo CRM conta para quem enviou;
 * pelo n8n ou celular, e as recebidas, para o vendedor atribuído à empresa; o resto em "Sem vendedor".
 */
export function CrmReportPage() {
  const options = useMemo(periodOptions, []);
  const [period, setPeriod] = useState('7');
  const { from, to, group } = range(period);
  const { data, error, loading, reload } = useAsync(() => crmService.messagesReport(from, to, group), [from, to, group]);

  const view = useMemo(() => (data ? build(data) : null), [data]);
  const label = (k: string) =>
    k.length === 7
      ? monthName(k)
      : new Date(`${k}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

  return (
    <Card className="overflow-hidden">
      <CrmBar tone="rose" icon={<BarChart3 className="size-4" />} title="Relatório" subtitle="Mensagens e clientes por vendedor">
        <div className="sm:ml-auto">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período">
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </CrmBar>
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading || !view ? (
        <LoadingBlock />
      ) : (
        <div>
          <PeriodTable title="Mensagens enviadas" cols={view.cols} keys={view.keys} count={view.sent} label={label} />
          <PeriodTable title="Mensagens recebidas" cols={view.cols} keys={view.keys} count={view.received} label={label} />

          <Section
            title="Clientes contatados"
            note="Novo: o primeiro contato com o cliente foi neste período. Contatado: recebeu ao menos uma mensagem no período."
          >
            {!view.contacted.length ? (
              <p className="px-4 pb-4 text-sm text-zinc-500">Nenhum cliente contatado neste período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Vendedor</th>
                      <th className="px-3 py-3 text-right font-medium">Contatados</th>
                      <th className="px-3 py-3 text-right font-medium">Novos</th>
                      <th className="px-4 py-3 text-right font-medium">Já tinham contato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.contacted.map((r) => (
                      <tr key={r.id} className="border-b border-zinc-50">
                        <td className="px-4 py-2.5 text-zinc-700">{r.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{r.total}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.novos}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.total - r.novos}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-50 font-semibold">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-3 py-3 text-right tabular-nums">{view.contactedTotal.total}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{view.contactedTotal.novos}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{view.contactedTotal.total - view.contactedTotal.novos}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          <Section title="Mensagens por cliente">
            {!view.clients.length ? (
              <p className="px-4 pb-4 text-sm text-zinc-500">Nenhuma conversa neste período.</p>
            ) : (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Cliente</th>
                      <th className="px-3 py-3 font-medium">Vendedor</th>
                      <th className="px-3 py-3 text-right font-medium">Enviadas</th>
                      <th className="px-4 py-3 text-right font-medium">Recebidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.clients.map((c) => (
                      <tr key={c.conversation_id} className="border-b border-zinc-50">
                        <td className="px-4 py-2.5 text-zinc-700">
                          {c.name}
                          {c.is_new && c.sent ? (
                            <span className="ml-2 rounded-full bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">novo</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-500">{c.seller}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{c.sent}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.received}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            Enviadas pelo CRM contam para quem enviou; pelo n8n ou pelo celular, e as recebidas, para o vendedor atribuído à empresa da conversa.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Monta colunas (vendedores), linhas (dias ou meses) e as contagens do relatório. */
function build(data: MessagesReport) {
  const names = new Map(data.users.map((u) => [u.id, u.name]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Usuário removido') : 'Sem vendedor');
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  const perUser = new Map<string, number>();
  for (const r of data.rows) {
    const u = r.user_id ?? NO_SELLER;
    (r.direction === 'out' ? sent : received).set(`${r.day}|${u}`, r.total);
    perUser.set(u, (perUser.get(u) ?? 0) + r.total);
  }
  // Quem mais trocou mensagens primeiro; "Sem vendedor" por último (só se houver)
  const cols: Col[] = data.users
    .filter((u) => perUser.has(u.id))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => (perUser.get(b.id) ?? 0) - (perUser.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
  if (perUser.has(NO_SELLER)) cols.push({ id: NO_SELLER, name: 'Sem vendedor' });
  const keys: string[] = [];
  if (data.group === 'month') for (let m = data.to.slice(0, 7); m >= data.from.slice(0, 7); m = addMonths(m, -1)) keys.push(m);
  else for (let d = data.to; d >= data.from; d = addDays(d, -1)) keys.push(d);

  const contactedBy = new Map<string, { id: string; name: string; total: number; novos: number }>();
  for (const c of data.clients) {
    if (!c.sent) continue;
    const id = c.user_id ?? NO_SELLER;
    const row = contactedBy.get(id) ?? { id, name: nameOf(c.user_id), total: 0, novos: 0 };
    row.total++;
    if (c.is_new) row.novos++;
    contactedBy.set(id, row);
  }
  const contacted = [...contactedBy.values()].sort((a, b) => (a.id === NO_SELLER ? 1 : b.id === NO_SELLER ? -1 : b.total - a.total));
  const contactedTotal = contacted.reduce((t, r) => ({ total: t.total + r.total, novos: t.novos + r.novos }), { total: 0, novos: 0 });
  const clients = data.clients.map((c) => ({ ...c, seller: nameOf(c.user_id) }));
  return { cols, keys, sent, received, contacted, contactedTotal, clients };
}
