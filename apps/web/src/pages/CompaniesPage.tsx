import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ExternalLink, Eye, Pencil, PanelsTopLeft, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, Select, StatusBadge, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useLandingPageActions } from '@/hooks/useLandingPageActions';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { companyService } from '@/services';
import type { CompanyListItem } from '@/types';

export function CompaniesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const deferredSearch = useDeferredValue(search);
  const { data, error, loading, reload } = useAsync(
    () => companyService.list({ search: deferredSearch || undefined, segment: segment || undefined, city: city || undefined, status: status || undefined }),
    [deferredSearch, segment, city, status],
  );
  const actions = useLandingPageActions(reload);
  const [toDelete, setToDelete] = useState<CompanyListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await companyService.remove(toDelete.id);
      toast.success('Empresa excluída.');
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const filtered = !!(search || segment || city || status);

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cadastros com os dados estruturados usados nas Landing Pages."
        actions={
          <Link to="/nova">
            <Button icon={<Plus className="size-4" />}>Nova empresa</Button>
          </Link>
        }
      />

      <Card>
        <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input placeholder="Buscar por nome…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segmento">
            <option value="">Todos os segmentos</option>
            {data?.facets.segments.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Cidade">
            <option value="">Todas as cidades</option>
            {data?.facets.cities.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="sem_lp">Sem Landing Page</option>
          </Select>
        </div>

        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={filtered ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
            description={filtered ? 'Ajuste a busca ou os filtros.' : 'Cadastre uma empresa informando a URL do site dela.'}
            action={!filtered ? <Link to="/nova"><Button icon={<Plus className="size-4" />}>Cadastrar pela URL</Button></Link> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-3 py-3">Segmento</th>
                  <th className="px-3 py-3">Cidade</th>
                  <th className="px-3 py-3">Contato</th>
                  <th className="px-3 py-3">Landing Page</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <Link to={`/empresas/${c.id}`} className="font-medium text-ink hover:underline">{c.name}</Link>
                    </td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.segment ?? '—'}</td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.city ? `${c.city}${c.state ? ` – ${c.state}` : ''}` : '—'}</td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.whatsapp || c.phone || c.email || '—'}</td>
                    <td className="px-3 py-3.5">
                      {c.slug ? (
                        <a href={`/lp/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                          /lp/{c.slug} <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      {c.landing_page_id && c.status ? (
                        <StatusToggle status={c.status} loading={actions.busyId === c.landing_page_id} onToggle={() => actions.toggleStatus(c.landing_page_id!, c.status!)} />
                      ) : (
                        <StatusBadge status={null} />
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-zinc-500">{formatDate(c.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        {c.slug ? (
                          <a href={`/lp/${c.slug}`} target="_blank" rel="noreferrer" title="Visualizar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                            <Eye className="size-4" />
                          </a>
                        ) : null}
                        <button onClick={() => navigate(`/empresas/${c.id}`)} title="Editar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <Pencil className="size-4" />
                        </button>
                        {c.landing_page_id ? (
                          <button onClick={() => navigate(`/landing-pages/${c.landing_page_id}`)} title="Landing Page" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                            <PanelsTopLeft className="size-4" />
                          </button>
                        ) : null}
                        <button onClick={() => setToDelete(c)} title="Excluir" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir empresa?"
        description={
          <>
            <strong>{toDelete?.name}</strong> e todos os dados vinculados (serviços, imagens e Landing Page) serão excluídos
            permanentemente.
          </>
        }
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
