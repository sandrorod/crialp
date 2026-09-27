import { Link } from 'react-router';
import { ArrowUpRight, Building2, CircleCheck, CircleOff, PanelsTopLeft, Plus, Sparkles } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBlock, PageHeader, StatusBadge } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { relativeTime } from '@/lib/utils';
import { miscService } from '@/services';

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => miscService.dashboard(), []);

  const cards = [
    { label: 'Empresas', value: data?.companies, icon: Building2, tone: 'text-zinc-600 bg-zinc-100' },
    { label: 'Landing Pages', value: data?.landing_pages, icon: PanelsTopLeft, tone: 'text-brand-700 bg-brand-50' },
    { label: 'Ativas', value: data?.active, icon: CircleCheck, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Inativas', value: data?.inactive, icon: CircleOff, tone: 'text-red-700 bg-red-50' },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral das empresas e Landing Pages."
        actions={
          <Link to="/nova">
            <Button icon={<Plus className="size-4" />}>Nova Landing Page</Button>
          </Link>
        }
      />
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{c.label}</span>
              <span className={`grid size-8 place-items-center rounded-lg ${c.tone}`}>
                <c.icon className="size-4" />
              </span>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
              {loading ? <span className="skeleton inline-block h-8 w-14 rounded-md" /> : c.value ?? 0}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold">Criadas recentemente</h2>
            <Link to="/landing-pages" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Ver todas
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
            </div>
          ) : data && data.recent.length ? (
            <ul className="divide-y divide-zinc-100">
              {data.recent.map((lp) => (
                <li key={lp.id}>
                  <Link to={`/landing-pages/${lp.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-zinc-50">
                    <div className="grid size-9 flex-none place-items-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-600">
                      {lp.company_name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{lp.company_name}</div>
                      <div className="truncate text-xs text-zinc-500">/lp/{lp.slug} · {lp.segment ?? 'Sem segmento'}</div>
                    </div>
                    <span className="hidden text-xs text-zinc-400 sm:block">{relativeTime(lp.created_at)}</span>
                    <StatusBadge status={lp.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<PanelsTopLeft className="size-5" />}
              title="Nenhuma Landing Page ainda"
              description="Crie a primeira a partir do site de uma empresa."
              action={
                <Link to="/nova">
                  <Button icon={<Plus className="size-4" />}>Criar Landing Page</Button>
                </Link>
              }
            />
          )}
        </Card>

        <div className="relative overflow-hidden rounded-xl bg-ink p-6 text-white shadow-sm">
          <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            <Sparkles className="size-6 text-brand-100" />
            <h3 className="mt-4 text-lg font-semibold">Crie uma LP a partir de uma URL</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Cole o endereço do site. A IA coleta os dados reais da empresa, você revisa e publica.
            </p>
            <Link to="/nova" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:underline">
              Começar agora <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
