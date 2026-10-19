import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, BadgeCheck, Building2, CircleCheck, CircleOff, PanelsTopLeft, Plus, Sparkles } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBlock, Input, Modal, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { relativeTime } from '@/lib/utils';
import { miscService } from '@/services';

export function DashboardPage() {
  const { data, error, loading, reload } = useAsync(() => miscService.dashboard(), []);
  const [wpOpen, setWpOpen] = useState(false);

  const cards = [
    { label: 'Empresas', value: data?.companies, icon: Building2, tone: 'text-zinc-600 bg-zinc-100' },
    { label: 'WP verificado', value: data?.wp_verified, icon: BadgeCheck, tone: 'text-zinc-600 bg-zinc-100', onOpen: () => setWpOpen(true) },
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">{c.label}</span>
              <span className={`grid size-8 place-items-center rounded-lg ${c.tone}`}>
                <c.icon className="size-4" />
              </span>
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
              {loading ? (
                <span className="skeleton inline-block h-8 w-14 rounded-md" />
              ) : 'onOpen' in c && c.onOpen ? (
                <button type="button" onClick={c.onOpen} className="rounded-md hover:text-brand-600 hover:underline" title="Ver a lista">
                  {c.value ?? 0}
                </button>
              ) : (
                c.value ?? 0
              )}
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
      <WpVerifiedModal open={wpOpen} onClose={() => setWpOpen(false)} />
    </>
  );
}

/** Popup do card "WP verificado": número verificado de cada empresa e o status do teste (wp_testado). */
function WpVerifiedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, error, loading, reload } = useAsync(() => (open ? miscService.wpVerified() : Promise.resolve(null)), [open]);
  const [search, setSearch] = useState('');
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (data?.items ?? []).filter(
      (i) => !q || i.name.toLowerCase().includes(q) || (digits && i.wp_verificado.replace(/\D/g, '').includes(digits)),
    );
  }, [data, search]);

  return (
    <Modal
      open={open}
      title="WP verificado"
      description={data ? `${data.items.length} números verificados` : undefined}
      onClose={() => {
        setSearch('');
        onClose();
      }}
      size="lg"
    >
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid place-items-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <Input placeholder="Buscar por empresa ou número" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 bg-zinc-50 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              <span>Empresa</span>
              <span>Número</span>
              <span className="w-20 text-right">Status</span>
            </div>
            {items.length ? (
              items.map((i) => (
                <div key={i.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2.5 text-sm">
                  <span className="truncate" title={i.name}>{i.name}</span>
                  <span className="font-mono tabular-nums text-zinc-700">{i.wp_verificado}</span>
                  <span className="w-20 text-right">
                    {i.wp_testado ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{i.wp_testado}</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum resultado.</div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
