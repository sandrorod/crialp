import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, LoadingBlock, Textarea } from '@/components/ui';
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
  const items = data?.items ?? [];

  const create = async () => {
    setCreating(true);
    try {
      const row = await miscService.createAtendimento(null);
      setData({ items: [...items, row] });
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
        <div className="space-y-6">
          {items.map((item) => (
            <AtendimentoEditor
              key={item.id}
              item={item}
              onSaved={(row) => setData({ items: items.map((i) => (i.id === row.id ? row : i)) })}
              onDelete={() => setToDelete(item)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Nenhum registro. Clique em "Novo registro" para começar.</p>
      )}
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

function AtendimentoEditor({ item, onSaved, onDelete }: { item: AtendimentoItem; onSaved: (row: AtendimentoItem) => void; onDelete: () => void }) {
  const [text, setText] = useState(item.respostas ?? '');
  const [saving, setSaving] = useState(false);
  const changed = text !== (item.respostas ?? '');

  const save = async () => {
    setSaving(true);
    try {
      const row = await miscService.saveAtendimento(item.id, text.trim() ? text : null);
      onSaved(row);
      setText(row.respostas ?? '');
      toast.success('Respostas salvas.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">Registro #{item.id}</span>
        <span className="tabular-nums">{text.length.toLocaleString('pt-BR')} caracteres</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva aqui as respostas do atendimento…"
        className="min-h-[320px] resize-y font-mono text-[13px]"
        spellCheck
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={onDelete} className="text-red-600 hover:text-red-700">
          Excluir
        </Button>
        <div className="flex items-center gap-2">
          {changed ? <span className="text-xs text-amber-600">Alterações não salvas</span> : null}
          {changed ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setText(item.respostas ?? '')}>
              Descartar
            </Button>
          ) : null}
          <Button type="button" size="sm" loading={saving} disabled={!changed} onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
