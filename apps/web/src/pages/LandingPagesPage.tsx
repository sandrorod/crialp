import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, PanelsTopLeft, Pencil, Plus, Search, Share2, Trash2 } from 'lucide-react';
import { SellerCell, useSellers } from '@/components/SellerCell';
import { Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Pagination, Select, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { usePagination } from '@/hooks/usePagination';
import { useLandingPageActions } from '@/hooks/useLandingPageActions';
import { formatDate } from '@/lib/utils';
import { landingPageService } from '@/services';
import type { LandingPageListItem } from '@/types';

export function LandingPagesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const deferred = useDeferredValue(search);
  const { data, error, loading, reload } = useAsync(
    () => landingPageService.list({ search: deferred || undefined, status: status || undefined }),
    [deferred, status],
  );
  // 10 por página; volta para a primeira ao mudar os filtros
  const pager = usePagination(data?.items, 10, [deferred, status].join('|'));
  const actions = useLandingPageActions(reload);
  const { sellers, canAssign } = useSellers();
  const [toDelete, setToDelete] = useState<LandingPageListItem | null>(null);

  return (
    <>
      <PageHeader
        title="Landing Pages"
        description="Páginas geradas, com endereço próprio e controle de publicação."
        actions={
          <Link to="/nova">
            <Button icon={<Plus className="size-4" />}>Nova Landing Page</Button>
          </Link>
        }
      />
      <Card>
        <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input placeholder="Buscar por empresa ou endereço…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="ativa">Ativas</option>
            <option value="inativa">Inativas</option>
          </Select>
        </div>

        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<PanelsTopLeft className="size-5" />}
            title="Nenhuma Landing Page encontrada"
            description={search || status ? 'Ajuste a busca ou o filtro.' : 'Gere a primeira Landing Page a partir de uma URL.'}
            action={!search && !status ? <Link to="/nova"><Button icon={<Plus className="size-4" />}>Criar Landing Page</Button></Link> : undefined}
          />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Criação</th>
                  <th className="px-3 py-3">Última atualização</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pager.items.map((lp) => (
                  <tr key={lp.id} className="transition hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/landing-pages/${lp.id}`} className="font-medium hover:underline">{lp.company_name}</Link>
                      <div className="text-xs text-zinc-500">{lp.segment ?? '—'} · v{lp.current_version}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <SellerCell landingPageId={lp.id} sellerId={lp.seller_id} sellerName={lp.seller_name} sellers={sellers} canAssign={canAssign} onChanged={reload} />
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusToggle status={lp.status} loading={actions.busyId === lp.id} onToggle={() => actions.toggleStatus(lp.id, lp.status)} />
                    </td>
                    <td className="px-3 py-3.5 text-zinc-500">{formatDate(lp.created_at)}</td>
                    <td className="px-3 py-3.5 text-zinc-500">{formatDate(lp.updated_at, true)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <a href={landingPageService.previewUrl(lp.id)} target="_blank" rel="noreferrer" title="Visualizar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <Eye className="size-4" />
                        </a>
                        <button onClick={() => actions.copyUrl(lp.public_url)} title="Copiar link da Landing Page" aria-label="Copiar link da Landing Page" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <Share2 className="size-4" />
                        </button>
                        <button onClick={() => navigate(`/landing-pages/${lp.id}`)} title="Editar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setToDelete(lp)} title="Excluir" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pager.page} pages={pager.pages} total={pager.total} pageSize={pager.pageSize} onPage={(p) => { pager.setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir Landing Page?"
        description={
          <>
            A página de <strong>{toDelete?.company_name}</strong> e todo o histórico de versões serão excluídos. Os dados da empresa
            são mantidos.
          </>
        }
        confirmLabel="Excluir"
        danger
        loading={!!toDelete && actions.busyId === toDelete.id}
        onConfirm={async () => {
          if (toDelete) await actions.remove(toDelete.id);
          setToDelete(null);
        }}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
