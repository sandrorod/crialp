import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ErrorBlock, Field, Input, LoadingBlock, Modal, Select } from '@/components/ui';
import { DealForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { crmService, money, type StageInput } from '@/services/crm';
import type { CrmDeal, CrmStage } from '@/types/crm';
import { isCrmManager } from './CrmLayout';

const STAGE_COLORS = ['#71717a', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#f97316', '#16a34a', '#dc2626', '#0f766e', '#2553e0'];
const KIND_LABEL: Record<CrmStage['kind'], string> = { open: 'Em andamento', won: 'Ganho', lost: 'Perdido' };

export function CrmPipelinePage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const [seller, setSeller] = useState('');
  const { data: stages, setData: setStages, error: stagesError, reload: reloadStages } = useAsync(() => crmService.stages(), []);
  const { data: deals, setData, error, loading, reload } = useAsync(() => crmService.deals({ seller: seller || undefined }), [seller]);
  const { data: users } = useAsync(() => (manager ? crmService.users() : Promise.resolve([])), [manager]);
  const [editing, setEditing] = useState<{ deal?: CrmDeal; stageId?: string } | null>(null);
  const [stageForm, setStageForm] = useState<CrmStage | 'new' | null>(null);
  const [removingStage, setRemovingStage] = useState<CrmStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = async (id: string, stageId: string) => {
    const before = deals;
    const maxPos = Math.max(0, ...(deals ?? []).filter((d) => d.stage_id === stageId).map((d) => d.position));
    setData((deals ?? []).map((d) => (d.id === id ? { ...d, stage_id: stageId, position: maxPos + 1 } : d)));
    try {
      await crmService.moveDeal(id, stageId);
    } catch (err) {
      setData(before);
      toast.error(errorMessage(err));
    }
  };

  const removeDeal = async (d: CrmDeal) => {
    if (!window.confirm(`Excluir o negócio "${d.title}"? Esta ação não pode ser desfeita.`)) return;
    const before = deals;
    setData((deals ?? []).filter((x) => x.id !== d.id));
    try {
      await crmService.removeDeal(d.id);
      toast.success('Negócio excluído.');
    } catch (err) {
      setData(before);
      toast.error(errorMessage(err));
    }
  };

  const shiftStage = async (stage: CrmStage, dir: -1 | 1) => {
    if (!stages) return;
    const i = stages.findIndex((s) => s.id === stage.id);
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = stages.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
    try {
      await crmService.reorderStages(next.map((s) => s.id));
    } catch (err) {
      setStages(stages);
      toast.error(errorMessage(err));
    }
  };

  if (error || stagesError) return <ErrorBlock message={(error ?? stagesError)!} onRetry={reload} />;
  if ((loading && !deals) || !stages) return <LoadingBlock />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {manager ? (
          <Select value={seller} onChange={(e) => setSeller(e.target.value)} className="w-auto" aria-label="Vendedor">
            <option value="">Todos os vendedores</option>
            {users?.filter((u) => u.role === 'seller').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        ) : null}
        <div className="ml-auto flex gap-2">
          {manager ? <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setStageForm('new')}>Nova coluna</Button> : null}
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing({})}>Novo negócio</Button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage, index) => {
          const cards = (deals ?? []).filter((d) => d.stage_id === stage.id).sort((a, b) => a.position - b.position);
          const total = cards.reduce((s, d) => s + Number(d.value), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOver(stage.id); }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={() => {
                if (dragging) void move(dragging, stage.id);
                setDragging(null);
                setOver(null);
              }}
              className={cn('flex w-72 shrink-0 flex-col rounded-xl bg-zinc-100/80', over === stage.id && 'ring-2 ring-brand-500')}
            >
              <div className="rounded-t-xl border-t-4 px-3 py-2.5" style={{ borderColor: stage.color }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink" title={KIND_LABEL[stage.kind]}>{stage.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-zinc-500">{cards.length}</span>
                    {manager ? (
                      <StageMenu
                        first={index === 0}
                        last={index === stages.length - 1}
                        onEdit={() => setStageForm(stage)}
                        onLeft={() => void shiftStage(stage, -1)}
                        onRight={() => void shiftStage(stage, 1)}
                        onDelete={() => setRemovingStage(stage)}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">{money(total)}{stage.kind !== 'open' ? ` · ${KIND_LABEL[stage.kind]}` : ''}</div>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {cards.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={() => setEditing({ deal: d })}
                    className={cn('group relative cursor-grab rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-xs hover:border-zinc-300', dragging === d.id && 'opacity-50')}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void removeDeal(d); }}
                      className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      title="Excluir negócio"
                      aria-label="Excluir negócio"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="pr-6 font-medium text-ink">{d.title}</div>
                    <Link to={`/crm/empresas/${d.company_id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-zinc-500 hover:underline">{d.company_name}</Link>
                    <div className="mt-2 flex justify-between text-xs">
                      <span className="font-medium text-zinc-700">{money(d.value)}</span>
                      {d.expected_close ? <span className="text-zinc-500">{formatDate(d.expected_close)}</span> : null}
                    </div>
                    {/* No celular não há arrastar: troca de etapa pela lista */}
                    <select
                      className="mt-2 w-full rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-xs md:hidden"
                      value={d.stage_id}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => void move(d.id, e.target.value)}
                    >
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                ))}
                <button className="w-full rounded-md py-1.5 text-xs text-zinc-500 hover:bg-zinc-200" onClick={() => setEditing({ stageId: stage.id })}>+ adicionar</button>
              </div>
            </div>
          );
        })}
        {manager ? (
          <button
            type="button"
            onClick={() => setStageForm('new')}
            className="flex h-24 w-56 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 text-sm text-zinc-500 hover:border-zinc-300 hover:text-ink"
          >
            <Plus className="size-4" /> Nova coluna
          </button>
        ) : null}
      </div>

      {editing ? <DealForm deal={editing.deal} stageId={editing.stageId} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      {stageForm ? (
        <StageForm stage={stageForm === 'new' ? null : stageForm} onClose={() => setStageForm(null)} onSaved={() => void reloadStages()} />
      ) : null}
      {removingStage ? (
        <RemoveStage
          stage={removingStage}
          stages={stages}
          dealCount={(deals ?? []).filter((d) => d.stage_id === removingStage.id).length}
          filtered={!!seller}
          onClose={() => setRemovingStage(null)}
          onDone={() => {
            void reloadStages();
            void reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Menu "⋯" da coluna: editar, mudar de lugar e excluir. */
function StageMenu({ first, last, onEdit, onLeft, onRight, onDelete }: { first: boolean; last: boolean; onEdit: () => void; onLeft: () => void; onRight: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const item = (label: string, icon: React.ReactNode, onClick: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      disabled={opts.disabled}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-40', opts.danger ? 'text-red-600' : 'text-zinc-700')}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-200 hover:text-ink" aria-label="Opções da coluna" title="Opções da coluna">
        <MoreHorizontal className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {item('Editar coluna', <Pencil className="size-4" />, onEdit)}
          {item('Mover para a esquerda', <ChevronLeft className="size-4" />, onLeft, { disabled: first })}
          {item('Mover para a direita', <ChevronRight className="size-4" />, onRight, { disabled: last })}
          {item('Excluir coluna', <Trash2 className="size-4" />, onDelete, { danger: true })}
        </div>
      ) : null}
    </div>
  );
}

function StageForm({ stage, onClose, onSaved }: { stage: CrmStage | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<StageInput>({ name: stage?.name ?? '', color: stage?.color ?? STAGE_COLORS[1], kind: stage?.kind ?? 'open' });
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (stage) await crmService.updateStage(stage.id, f);
      else await crmService.createStage(f);
      toast.success(stage ? 'Coluna atualizada.' : 'Coluna criada.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title={stage ? 'Editar coluna' : 'Nova coluna'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="crm-stage" loading={saving}>Salvar</Button>
        </>
      }
    >
      <form id="crm-stage" onSubmit={save} className="space-y-4">
        <Field label="Nome *"><Input required autoFocus maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Reunião agendada" /></Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Cor</span>
          <div className="flex flex-wrap items-center gap-2">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setF({ ...f, color: c })}
                className={cn('size-7 rounded-full ring-offset-2', f.color.toLowerCase() === c && 'ring-2 ring-ink')}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
            <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-zinc-200 bg-white p-0.5" aria-label="Outra cor" title="Outra cor" />
          </div>
        </div>
        <Field label="Tipo" hint="Ganho e Perdido não entram no valor “em negociação” das empresas.">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as StageInput['kind'] })}>
            {(Object.keys(KIND_LABEL) as CrmStage['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

/** Excluir coluna: se tiver negócios, escolhe para onde eles vão. */
function RemoveStage({ stage, stages, dealCount, filtered, onClose, onDone }: { stage: CrmStage; stages: CrmStage[]; dealCount: number; filtered: boolean; onClose: () => void; onDone: () => void }) {
  const others = stages.filter((s) => s.id !== stage.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const r = await crmService.removeStage(stage.id, moveTo || undefined);
      toast.success(r.moved ? `Coluna excluída. ${r.moved} negócio(s) movido(s).` : 'Coluna excluída.');
      onDone();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={`Excluir a coluna "${stage.name}"?`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={() => void remove()} loading={busy} disabled={!others.length}>Excluir coluna</Button>
        </>
      }
    >
      {!others.length ? (
        <p className="text-sm text-zinc-600">O funil precisa de pelo menos uma coluna.</p>
      ) : (
        <div className="space-y-3 text-sm text-zinc-600">
          <p>
            {dealCount || filtered
              ? 'Os negócios desta coluna (de todos os vendedores) serão movidos para:'
              : 'A coluna está vazia. Se algum negócio for criado nela até lá, ele vai para:'}
          </p>
          <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      )}
    </Modal>
  );
}
