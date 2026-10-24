import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, Select } from '@/components/ui';
import { TaskForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService, dateTime } from '@/services/crm';
import type { CrmTask } from '@/types/crm';
import { isCrmManager } from './CrmLayout';

type Filter = 'pending' | 'today' | 'late' | 'done';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'today', label: 'Hoje' },
  { id: 'late', label: 'Atrasadas' },
  { id: 'done', label: 'Concluídas' },
];

function range(filter: Filter) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (filter === 'done') return { done: 'true' };
  if (filter === 'today') return { done: 'false', due_from: start.toISOString(), due_to: end.toISOString() };
  if (filter === 'late') return { done: 'false', due_to: now.toISOString() };
  return { done: 'false' };
}

export function CrmTasksPage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const [filter, setFilter] = useState<Filter>('pending');
  const [assignee, setAssignee] = useState('');
  const params = useMemo(() => ({ ...range(filter), assignee: assignee || undefined }), [filter, assignee]);
  const { data, setData, error, loading, reload } = useAsync(() => crmService.tasks(params), [params]);
  const { data: users } = useAsync(() => (manager ? crmService.users() : Promise.resolve([])), [manager]);
  const [editing, setEditing] = useState<CrmTask | null | undefined>(undefined);

  const toggle = async (t: CrmTask) => {
    setData((data ?? []).map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    try {
      await crmService.setTaskDone(t.id, !t.done);
    } catch (err) {
      toast.error(errorMessage(err));
    }
    void reload();
  };

  const now = Date.now();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button type="button"
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn('rounded-full px-3 py-1 text-sm', filter === f.id ? 'bg-ink text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50')}
          >
            {f.label}
          </button>
        ))}
        {manager ? (
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-auto" aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        ) : null}
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>Nova tarefa</Button>
      </div>

      <Card>
        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState icon={<CheckSquare className="size-5" />} title="Nenhuma tarefa aqui" description="Crie follow-ups para não esquecer de retornar aos clientes." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {data.map((t) => {
              const late = !t.done && t.due_at && new Date(t.due_at).getTime() < now;
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={t.done} onChange={() => void toggle(t)} aria-label="Concluída" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                    <div className={cn('text-ink', t.done && 'text-zinc-400 line-through')}>{t.title}</div>
                    <div className="text-xs text-zinc-500">
                      {t.company_name ?? 'sem empresa'}
                      {manager && t.assignee_id !== user?.id ? ` · ${t.assignee_name}` : ''}
                    </div>
                  </button>
                  {t.company_id ? <Link to={`/crm/empresas/${t.company_id}`} className="hidden text-xs text-brand-600 hover:underline sm:inline">abrir empresa</Link> : null}
                  <span className={cn('shrink-0 text-xs', late ? 'font-medium text-red-600' : 'text-zinc-500')}>{t.due_at ? dateTime(t.due_at) : 'sem prazo'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing !== undefined ? <TaskForm task={editing} onClose={() => setEditing(undefined)} onSaved={reload} /> : null}
    </>
  );
}
