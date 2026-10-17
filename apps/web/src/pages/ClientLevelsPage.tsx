import { useState, type FormEvent } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { clientLevelService } from '@/services';
import type { ClientLevel } from '@/types';

/** Menu "Nível cliente": cadastro dos níveis escolhidos na geração da Landing Page. */
export function ClientLevelsPage() {
  const { data, error, loading, reload } = useAsync(() => clientLevelService.list(), []);
  const [editing, setEditing] = useState<ClientLevel | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<ClientLevel | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await clientLevelService.remove(toDelete.id);
      toast.success('Nível excluído.');
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nível cliente"
        description="Níveis escolhidos ao gerar a Landing Page, junto com o vendedor."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Novo nível</Button>}
      />

      <Card>
        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="Nenhum nível cadastrado"
            description="Crie níveis como Bronze, Prata e Ouro para classificar os clientes."
            action={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Novo nível</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Nível</th>
                  <th className="px-3 py-3">Landing Pages</th>
                  <th className="px-3 py-3">Criação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.map((l) => (
                  <tr key={l.id} className="transition hover:bg-zinc-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">{l.name}</div>
                      {l.description ? <div className="text-xs text-zinc-500">{l.description}</div> : null}
                    </td>
                    <td data-label="Landing Pages" className="px-3 py-3.5 text-zinc-600">{l.landing_pages}</td>
                    <td data-label="Criação" className="px-3 py-3.5 text-zinc-500">{formatDate(l.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(l)} title="Editar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setToDelete(l)} title="Excluir" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
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

      <LevelFormModal
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir nível?"
        description={
          <>
            O nível <strong>{toDelete?.name}</strong> será excluído.
            {toDelete?.landing_pages ? ` ${toDelete.landing_pages} Landing Page(s) com esse nível ficarão sem nível.` : ''}
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

function LevelFormModal({ target, onClose, onSaved }: { target: ClientLevel | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const isNew = target === 'new';
  const existing = target && target !== 'new' ? target : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, description: description.trim() || null };
      if (existing) {
        await clientLevelService.update(existing.id, body);
        toast.success('Nível atualizado.');
      } else {
        await clientLevelService.create(body);
        toast.success('Nível criado.');
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={isNew ? 'Novo nível' : 'Editar nível'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="level-form" loading={saving}>{isNew ? 'Criar nível' : 'Salvar'}</Button>
        </>
      }
    >
      <form id="level-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus autoComplete="off" />
        </Field>
        <Field label="Descrição" hint="Opcional.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
        </Field>
      </form>
    </Modal>
  );
}
