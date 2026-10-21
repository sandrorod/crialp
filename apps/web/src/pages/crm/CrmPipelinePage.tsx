import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ErrorBlock, LoadingBlock, Select } from '@/components/ui';
import { DealForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { crmService, money } from '@/services/crm';
import type { CrmDeal } from '@/types/crm';
import { isCrmManager } from './CrmLayout';

export function CrmPipelinePage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const [seller, setSeller] = useState('');
  const { data: stages, error: stagesError } = useAsync(() => crmService.stages(), []);
  const { data: deals, setData, error, loading, reload } = useAsync(() => crmService.deals({ seller: seller || undefined }), [seller]);
  const { data: users } = useAsync(() => (manager ? crmService.users() : Promise.resolve([])), [manager]);
  const [editing, setEditing] = useState<{ deal?: CrmDeal; stageId?: string } | null>(null);
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
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setEditing({})}>Novo negócio</Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
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
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{stage.name}</span>
                  <span className="text-xs text-zinc-500">{cards.length}</span>
                </div>
                <div className="text-xs text-zinc-500">{money(total)}</div>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {cards.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={() => setEditing({ deal: d })}
                    className={cn('cursor-grab rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-xs hover:border-zinc-300', dragging === d.id && 'opacity-50')}
                  >
                    <div className="font-medium text-ink">{d.title}</div>
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
      </div>

      {editing ? <DealForm deal={editing.deal} stageId={editing.stageId} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </>
  );
}
