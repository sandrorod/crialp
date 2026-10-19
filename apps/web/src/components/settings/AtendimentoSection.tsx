import { useState } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, Field, Input, LoadingBlock, Modal, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { miscService } from '@/services';
import type { AtendimentoItem } from '@/types';

/** Textos de respostas do atendimento (tabela atendimento_lp): cada registro editado num campo grande. */
export function AtendimentoSection() {
  const { data, setData, error, loading, reload } = useAsync(() => miscService.atendimento(), []);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<AtendimentoItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.items ?? [];
  const opened = items.find((i) => i.id === openId) ?? null;

  const create = async () => {
    setCreating(true);
    try {
      const row = await miscService.createAtendimento({ titulo: null, respostas: null });
      setData({ items: [...items, row] });
      setOpenId(row.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await miscService.deleteAtendimento(toDelete.id);
      setData({ items: items.filter((i) => i.id !== toDelete.id) });
      if (openId === toDelete.id) setOpenId(null);
      setToDelete(null);
      toast.success('Registro excluído.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <CardSection
      title="Atendimento"
      description="Respostas usadas no atendimento (tabela atendimento_lp)."
      actions={
        <Button type="button" variant="secondary" size="sm" loading={creating} icon={<Plus className="size-3.5" />} onClick={create}>
          Novo registro
        </Button>
      }
    >
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingBlock rows={3} />
      ) : items.length ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50"
              >
                <span className="flex-none rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600">#{item.id}</span>
                <span className="min-w-0 flex-1">
                  <span className={item.titulo ? 'block truncate text-sm font-medium text-ink' : 'block truncate text-sm italic text-zinc-400'}>
                    {item.titulo || 'Sem título'}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {item.respostas ? item.respostas.replace(/\s+/g, ' ').slice(0, 200) : 'Sem texto — clique para escrever'}
                  </span>
                </span>
                <span className="flex-none text-xs tabular-nums text-zinc-400">{(item.respostas?.length ?? 0).toLocaleString('pt-BR')} caracteres</span>
                <ChevronRight className="size-4 flex-none text-zinc-400" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Nenhum registro. Clique em "Novo registro" para começar.</p>
      )}
      {opened ? (
        <AtendimentoEditor
          key={opened.id}
          item={opened}
          onClose={() => setOpenId(null)}
          onSaved={(row) => setData({ items: items.map((i) => (i.id === row.id ? row : i)) })}
          onDelete={() => setToDelete(opened)}
        />
      ) : null}
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir registro?"
        description={`O registro #${toDelete?.id ?? ''} e o texto dele serão apagados.`}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </CardSection>
  );
}

function AtendimentoEditor({ item, onClose, onSaved, onDelete }: { item: AtendimentoItem; onClose: () => void; onSaved: (row: AtendimentoItem) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(item.titulo ?? '');
  const [text, setText] = useState(item.respostas ?? '');
  const [saving, setSaving] = useState(false);
  const changed = text !== (item.respostas ?? '') || title.trim() !== (item.titulo ?? '');

  const save = async (close: boolean) => {
    setSaving(true);
    try {
      const row = await miscService.saveAtendimento(item.id, { titulo: title.trim() || null, respostas: text.trim() ? text : null });
      onSaved(row);
      setTitle(row.titulo ?? '');
      setText(row.respostas ?? '');
      toast.success('Respostas salvas.');
      if (close) onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  // Fechar com alterações não salvas pede confirmação
  const close = () => {
    if (changed && !window.confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
    onClose();
  };

  return (
    <Modal
      open
      title={title.trim() || `Resposta #${item.id}`}
      description={`${text.length.toLocaleString('pt-BR')} caracteres${changed ? ' · alterações não salvas' : ''}`}
      onClose={close}
      busy={saving}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={onDelete} className="text-red-600 hover:text-red-700">
            Excluir
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={saving}>
              Fechar
            </Button>
            <Button type="button" loading={saving} disabled={!changed} onClick={() => save(true)}>
              Salvar
            </Button>
          </div>
        </div>
      }
    >
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Ex.: Horários e formas de pagamento" autoFocus />
      </Field>
      <div className="mb-1.5 mt-4 text-[13px] font-medium text-zinc-700">Respostas</div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva aqui as respostas do atendimento…"
        className="min-h-[50vh] resize-y font-mono text-[13px]"
        spellCheck
        onKeyDown={(e) => {
          // Ctrl/Cmd + S salva sem fechar
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (changed && !saving) void save(false);
          }
        }}
      />
    </Modal>
  );
}
