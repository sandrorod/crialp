import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Building2, Search } from 'lucide-react';
import { Card, EmptyState, ErrorBlock, Input, LoadingBlock, Pagination, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { WhatsAppIcon } from '@/components/crm/WhatsAppIcon';
import { crmService, money, phone } from '@/services/crm';
import { isCrmManager } from './CrmLayout';

export function CrmCompaniesPage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState('');
  const deferred = useDeferredValue(search);
  const { data, error, loading, reload } = useAsync(() => crmService.companies({ search: deferred || undefined, seller: seller || undefined }), [deferred, seller]);
  const { data: users } = useAsync(() => (manager ? crmService.users() : Promise.resolve([])), [manager]);
  const pager = usePagination(data ?? undefined, 15, `${deferred}|${seller}`);

  return (
    <Card>
      <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Buscar por nome, cidade ou segmento…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {manager ? (
          <Select value={seller} onChange={(e) => setSeller(e.target.value)} aria-label="Vendedor">
            <option value="">Todos os vendedores</option>
            <option value="none">Sem vendedor</option>
            {users?.filter((u) => u.role === 'seller').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        ) : null}
      </div>

      {error ? (
        <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={search || seller ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa ainda'}
          description={manager ? 'As empresas cadastradas no sistema aparecem aqui.' : 'As empresas cuja Landing Page está atribuída a você aparecem aqui.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-cards w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-3 py-3">WhatsApp</th>
                  <th className="px-3 py-3">Contatos</th>
                  <th className="px-3 py-3">Em negociação</th>
                  <th className="px-3 py-3">Tarefas</th>
                  {manager ? <th className="px-5 py-3">Vendedor</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pager.items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/crm/empresas/${c.id}`} className="font-medium text-ink hover:underline">{c.name}</Link>
                      {c.unread ? <span className="ml-2 rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : null}
                      <div className="text-xs text-zinc-500">{[c.segment, [c.city, c.state].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td data-label="WhatsApp" className="px-3 py-3.5 text-zinc-600">
                      {c.whatsapp || c.mobile ? (
                        <Link
                          to={`/crm/whatsapp?empresa=${c.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[#128c7e] hover:bg-emerald-50"
                          title="Conversar pelo WhatsApp do CRM"
                          aria-label={`Conversar com ${c.name} pelo WhatsApp`}
                        >
                          <WhatsAppIcon className="size-4" />
                          <span className="text-zinc-600">{phone(c.whatsapp || c.mobile)}</span>
                        </Link>
                      ) : '—'}
                    </td>
                    <td data-label="Contatos" className="px-3 py-3.5 text-zinc-600">{c.contacts}</td>
                    <td data-label="Em negociação" className="px-3 py-3.5 text-zinc-600">{c.open_deals ? `${money(c.open_value)} (${c.open_deals})` : '—'}</td>
                    <td data-label="Tarefas" className="px-3 py-3.5 text-zinc-600">{c.pending_tasks || '—'}</td>
                    {manager ? <td data-label="Vendedor" className="px-5 py-3.5 text-zinc-600">{c.seller_names ?? <span className="text-amber-600">sem vendedor</span>}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pager.page} pages={pager.pages} total={pager.total} pageSize={pager.pageSize} onPage={(p) => { pager.setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </>
      )}
    </Card>
  );
}
