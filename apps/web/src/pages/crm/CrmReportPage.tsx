import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, ErrorBlock, LoadingBlock, Select } from '@/components/ui';
import { CrmBar } from '@/components/crm/CrmTheme';
import { useAsync } from '@/hooks/useAsync';
import { crmService } from '@/services/crm';

/** Datas no fuso de Brasília (o servidor conta os dias no mesmo fuso). */
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { id: '7', label: 'Últimos 7 dias' },
  { id: '30', label: 'Últimos 30 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'last-month', label: 'Mês passado' },
] as const;
type Period = (typeof PERIODS)[number]['id'];

function range(p: Period) {
  const today = ymd(new Date());
  if (p === '7') return { from: addDays(today, -6), to: today };
  if (p === '30') return { from: addDays(today, -29), to: today };
  const first = `${today.slice(0, 8)}01`;
  if (p === 'month') return { from: first, to: today };
  const lastPrev = addDays(first, -1);
  return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
}

const NO_SELLER = 'sem';

/**
 * Relatório (gerência): quantas mensagens cada vendedor enviou por dia. Pelo CRM conta para quem enviou;
 * pelo n8n ou celular, para o vendedor atribuído à empresa; o resto em "Sem vendedor".
 */
export function CrmReportPage() {
  const [period, setPeriod] = useState<Period>('7');
  const { from, to } = range(period);
  const { data, error, loading, reload } = useAsync(() => crmService.messagesReport(from, to), [from, to]);

  const table = useMemo(() => {
    if (!data) return null;
    const count = new Map<string, number>();
    const perUser = new Map<string, number>();
    for (const r of data.rows) {
      const u = r.user_id ?? NO_SELLER;
      count.set(`${r.day}|${u}`, r.total);
      perUser.set(u, (perUser.get(u) ?? 0) + r.total);
    }
    // Quem mais enviou primeiro; "Sem vendedor" por último (só se houver)
    const cols = data.users
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => (perUser.get(b.id) ?? 0) - (perUser.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
    if (perUser.has(NO_SELLER)) cols.push({ id: NO_SELLER, name: 'Sem vendedor' });
    const days: string[] = [];
    for (let d = data.to; d >= data.from; d = addDays(d, -1)) days.push(d);
    const total = [...perUser.values()].reduce((a, b) => a + b, 0);
    return { cols, days, count, perUser, total };
  }, [data]);

  const dayLabel = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

  return (
    <Card className="overflow-hidden">
      <CrmBar tone="rose" icon={<BarChart3 className="size-4" />} title="Relatório" subtitle="Mensagens enviadas por vendedor, por dia">
        <div className="sm:ml-auto">
          <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Período">
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </CrmBar>
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading || !table ? (
        <LoadingBlock />
      ) : !table.cols.length ? (
        <p className="p-6 text-center text-sm text-zinc-500">Nenhuma mensagem enviada neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Dia</th>
                {table.cols.map((c) => (
                  <th key={c.id} className="px-3 py-3 text-right font-medium">
                    {c.name}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {table.days.map((d) => {
                const dayTotal = table.cols.reduce((n, c) => n + (table.count.get(`${d}|${c.id}`) ?? 0), 0);
                return (
                  <tr key={d} className="border-b border-zinc-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600">{dayLabel(d)}</td>
                    {table.cols.map((c) => {
                      const n = table.count.get(`${d}|${c.id}`) ?? 0;
                      return (
                        <td key={c.id} className={`px-3 py-2.5 text-right tabular-nums ${n ? 'text-ink' : 'text-zinc-300'}`}>
                          {n}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{dayTotal}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                {table.cols.map((c) => (
                  <td key={c.id} className="px-3 py-3 text-right tabular-nums">
                    {table.perUser.get(c.id) ?? 0}
                  </td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{table.total}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-3 text-xs text-zinc-500">
            Enviadas pelo CRM contam para quem enviou; pelo n8n ou pelo celular, para o vendedor atribuído à empresa da conversa.
          </p>
        </div>
      )}
    </Card>
  );
}
