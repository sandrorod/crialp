import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { companyService } from '@/services';
import { Link } from 'react-router';
import { Building2, Search } from 'lucide-react';
import { Card, EmptyState, ErrorBlock, Input, LoadingBlock, Pagination, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { WhatsAppIcon } from '@/components/crm/WhatsAppIcon';
import { Avatar, CrmBar, Pill } from '@/components/crm/CrmTheme';
import { crmService, money, phone } from '@/services/crm';
import { isCrmManager } from './CrmLayout';

export function CrmCompaniesPage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState('');
  const deferred = useDeferredValue(search);
  const { data, setData, error, loading, reload } = useAsync(
    () => crmService.companies({ search: deferred || undefined, seller: seller || undefined }),
    [deferred, seller],
  );
  const { data: users } = useAsync(() => (manager ? crmService.users() : Promise.resolve([])), [manager]);
  const pager = usePagination(data ?? undefined, 15, `${deferred}|${seller}`);
  // Prospecção sim/não direto na lista (só a gerência): com "sim" o vendedor da LP passa a ver a empresa
  const [savingId, setSavingId] = useState<string | null>(null);
  const toggleProspecting = async (id: string, next: boolean) => {
    setSavingId(id);
    try {
      await companyService.setProspecting(id, next);
      setData((list) => list?.map((c) => (c.id === id ? { ...c, prospecting: next } : c)) ?? list);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CrmBar
        tone="blue"
        icon={<Building2 className="size-4" />}
        title="Empresas"
        subtitle={data ? `${data.length} ${data.length === 1 ? 'empresa' : 'empresas'}` : undefined}
      >
        <div className="relative min-w-[220px] flex-1 sm:ml-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Buscar por nome, cidade ou segmento…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {manager ? (
          <Select value={seller} onChange={(e) => setSeller(e.target.value)} aria-label="Vendedor" className="sm:w-[220px]">
            <option value="">Todos os vendedores</option>
            <option value="none">Sem vendedor</option>
            {users
              ?.filter((u) => u.role === 'seller')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        ) : null}
      </CrmBar>

      {error ? (
        <div className="p-4">
          <ErrorBlock message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <LoadingBlock />
      ) : !data?.length ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={search || seller ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa ainda'}
          description={manager ? 'As empresas cadastradas no sistema aparecem aqui.' : 'As empresas em prospecção aparecem aqui.'}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-cards w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-3 py-3">WhatsApp</th>
                  <th className="px-3 py-3">Contatos</th>
                  <th className="px-3 py-3">Em negociação</th>
                  <th className="px-3 py-3">Tarefas</th>
                  {manager ? <th className="px-3 py-3">Vendedor</th> : null}
                  {manager ? (
                    <th className="px-5 py-3" title="Com Sim os vendedores veem a empresa">
                      Prospecção
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pager.items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-blue-50/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <Link to={`/crm/empresas/${c.id}`} className="font-medium text-ink hover:text-blue-700 hover:underline">
                            {c.name}
                          </Link>
                          {c.unread ? (
                            <span className="ml-2 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white" title="Mensagens não lidas">
                              {c.unread}
                            </span>
                          ) : null}
                          <div className="text-xs text-zinc-500">{[c.segment, [c.city, c.state].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
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
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Contatos" className="px-3 py-3.5 text-zinc-600">
                      {c.contacts ? <Pill tone="sky">{c.contacts}</Pill> : <span className="text-zinc-400">—</span>}
                    </td>
                    <td data-label="Em negociação" className="px-3 py-3.5 text-zinc-600">
                      {c.open_deals ? (
                        <Pill tone="violet" title={`${c.open_deals} ${c.open_deals === 1 ? 'negócio aberto' : 'negócios abertos'}`}>
                          {money(c.open_value)} · {c.open_deals}
                        </Pill>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td data-label="Tarefas" className="px-3 py-3.5 text-zinc-600">
                      {c.pending_tasks ? <Pill tone="amber">{c.pending_tasks}</Pill> : <span className="text-zinc-400">—</span>}
                    </td>
                    {manager ? (
                      <td data-label="Vendedor" className="px-3 py-3.5 text-zinc-600">
                        {c.seller_names ?? <Pill tone="amber">sem vendedor</Pill>}
                      </td>
                    ) : null}
                    {manager ? (
                      <td data-label="Prospecção" className="px-5 py-3.5">
                        <button
                          type="button"
                          disabled={savingId === c.id}
                          onClick={() => void toggleProspecting(c.id, !c.prospecting)}
                          title={
                            c.prospecting ? 'Em prospecção: clique para esconder dos vendedores' : 'Fora de prospecção: clique para mostrar aos vendedores'
                          }
                          className="rounded-full disabled:opacity-50"
                        >
                          {c.prospecting === null ? (
                            <span className="px-2 text-zinc-400">—</span>
                          ) : (
                            <Pill tone={c.prospecting ? 'emerald' : 'zinc'}>{c.prospecting ? 'Sim' : 'Não'}</Pill>
                          )}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pager.page}
            pages={pager.pages}
            total={pager.total}
            pageSize={pager.pageSize}
            onPage={(p) => {
              pager.setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </>
      )}
    </Card>
  );
}
