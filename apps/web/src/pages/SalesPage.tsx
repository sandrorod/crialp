import { useDeferredValue, useState, type FormEvent } from 'react';
import { Building2, ChevronDown, Eye, MessageSquarePlus, Search, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { usePagination } from '@/hooks/usePagination';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn, copyToClipboard, formatDate } from '@/lib/utils';
import { salesService } from '@/services';
import type { ProspectingNote, SalesCompany } from '@/types';

export function SalesPage() {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('');
  const deferredSearch = useDeferredValue(search);
  const { data, error, loading, reload } = useAsync(
    () => salesService.companies({ search: deferredSearch || undefined, segment: segment || undefined, city: city || undefined }),
    [deferredSearch, segment, city],
  );
  // 10 por página; volta para a primeira ao mudar os filtros
  const pager = usePagination(data?.items, 10, [deferredSearch, segment, city].join('|'));
  const [prospecting, setProspecting] = useState<SalesCompany | null>(null);
  const filtered = !!(search || segment || city);

  const shareLink = async (slug: string) => {
    if (await copyToClipboard(`${window.location.origin}/lp/${slug}`)) toast.success('Link da Landing Page copiado.');
    else toast.error('Não foi possível copiar o link.');
  };

  return (
    <>
      <PageHeader title="Vendas" description="Empresas cadastradas e o histórico de prospecção de cada uma." />

      <Card>
        <div className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px]">
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
        </div>

        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Building2 className="size-5" />}
            title={filtered ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}
            description={filtered ? 'Ajuste a busca ou os filtros.' : 'As empresas cadastradas pelo administrador aparecem aqui.'}
          />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-3 py-3">Segmento</th>
                  <th className="px-3 py-3">Cidade</th>
                  <th className="px-3 py-3">Contato</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">Última prospecção</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pager.items.map((c) => (
                  <tr key={c.id} className="transition hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5 font-medium text-ink">{c.name}</td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.segment ?? '—'}</td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.city ? `${c.city}${c.state ? ` – ${c.state}` : ''}` : '—'}</td>
                    <td className="px-3 py-3.5 text-zinc-600">{c.whatsapp || c.phone || c.email || '—'}</td>
                    <td className={c.seller_name ? 'px-3 py-3.5 text-zinc-600' : 'px-3 py-3.5 text-zinc-400'}>{c.seller_name ?? '—'}</td>
                    <td className="px-3 py-3.5 text-zinc-500">
                      {c.last_note_at ? `${formatDate(c.last_note_at)} · ${c.notes_count} ${c.notes_count === 1 ? 'lançamento' : 'lançamentos'}` : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {c.slug ? (
                          <>
                            <a href={`/lp/${c.slug}`} target="_blank" rel="noreferrer" title="Abrir Landing Page" aria-label="Abrir Landing Page" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                              <Eye className="size-4" />
                            </a>
                            <button type="button" onClick={() => void shareLink(c.slug!)} title="Copiar link da Landing Page" aria-label="Copiar link da Landing Page" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                              <Share2 className="size-4" />
                            </button>
                          </>
                        ) : null}
                        <button type="button" onClick={() => setProspecting(c)} title="Prospecção" aria-label="Prospecção" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <MessageSquarePlus className="size-4" />
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

      <ProspectingModal company={prospecting} onClose={() => setProspecting(null)} onAdded={reload} />
    </>
  );
}

function ProspectingModal({ company, onClose, onAdded }: { company: SalesCompany | null; onClose: () => void; onAdded: () => void }) {
  const { data: notes, error, loading, reload } = useAsync(async () => (company ? salesService.notes(company.id) : null), [company?.id]);
  const { user } = useAuth();
  const canDelete = user?.role === 'owner' || user?.role === 'admin';
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<ProspectingNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setText('');
    setExpanded(new Set());
    onClose();
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmDelete = async () => {
    if (!company || !toDelete) return;
    setDeleting(true);
    try {
      await salesService.removeNote(company.id, toDelete.id);
      toast.success('Lançamento excluído.');
      setToDelete(null);
      reload();
      onAdded();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!company || !text.trim()) return;
    setSaving(true);
    try {
      await salesService.addNote(company.id, text);
      setText('');
      toast.success('Lançamento adicionado ao histórico.');
      reload();
      onAdded();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!company} title="Prospecção" description={company?.name} onClose={close} busy={saving} size="lg">
      <form onSubmit={submit} className="space-y-2">
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={5000}
          placeholder="Ex.: Liguei para o responsável, pediu retorno na sexta com a proposta."
          autoFocus
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {canDelete ? 'Depois de adicionado, o lançamento não pode ser editado.' : 'Depois de adicionado, o lançamento não pode ser editado nem excluído.'}
          </p>
          <Button type="submit" loading={saving} disabled={!text.trim()}>Adicionar</Button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold">Histórico</h3>
        {error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : loading && !notes ? (
          <LoadingBlock rows={3} />
        ) : !notes?.length ? (
          <p className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">Nenhum lançamento ainda.</p>
        ) : (
          <ol className="scrollbar-visible max-h-[45vh] space-y-3 overflow-y-scroll pr-2">
            {notes.map((n) => {
              const open = expanded.has(n.id);
              return (
                <li key={n.id} className="rounded-lg border border-zinc-200">
                  <div className="flex items-start gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => toggle(n.id)}
                      aria-expanded={open}
                      className="min-w-0 flex-1 rounded-md p-2 text-left transition hover:bg-zinc-50"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">{n.author_name}</span>
                        <span className="flex items-center gap-1.5">
                          <time dateTime={n.created_at}>{formatDate(n.created_at, true)}</time>
                          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
                        </span>
                      </div>
                      {/* Fechado: só a primeira linha; aberto: o texto completo */}
                      <p className={cn('break-words text-sm text-ink', open ? 'whitespace-pre-wrap' : 'truncate')}>
                        {open ? n.note : n.note.split('\n')[0]}
                      </p>
                    </button>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setToDelete(n)}
                        title="Excluir lançamento"
                        aria-label="Excluir lançamento"
                        className="rounded-md p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir lançamento?"
        description="O lançamento será removido do histórico de prospecção permanentemente."
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </Modal>
  );
}
