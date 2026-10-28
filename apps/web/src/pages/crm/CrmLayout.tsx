import { Link, NavLink, Outlet } from 'react-router';
import { BarChart3, Building2, CalendarClock, CheckSquare, KanbanSquare, MessageCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Modal } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService, dateTime, TASK_CREATED_EVENT } from '@/services/crm';
import type { CrmTaskAlert } from '@/types/crm';
import { TONES, type CrmTone } from '@/components/crm/CrmTheme';
import { useEffect, useState } from 'react';

export const isCrmManager = (role?: string) => role === 'owner' || role === 'admin';

export function CrmLayout() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const unread = useAsync(() => crmService.unread(), []);
  useEffect(() => {
    // Fora da tela do WhatsApp também confere mensagens novas, para o contador do menu
    const t = setInterval(
      () =>
        void crmService
          .sync()
          .catch(() => null)
          .then(() => unread.reload()),
      30_000,
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tarefa nova: popup em qualquer aba do CRM, até a pessoa fechar (o servidor guarda quem já fechou)
  const alerts = useAsync(() => crmService.taskAlerts(), []);
  useEffect(() => {
    const reload = () => void alerts.reload();
    const t = setInterval(reload, 20_000);
    window.addEventListener(TASK_CREATED_EVENT, reload);
    return () => {
      clearInterval(t);
      window.removeEventListener(TASK_CREATED_EVENT, reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { to: '/crm', label: 'Empresas', icon: Building2, end: true, tone: 'blue' as CrmTone },
    { to: '/crm/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: unread.data?.total ?? 0, tone: 'emerald' as CrmTone },
    { to: '/crm/funil', label: 'Funil', icon: KanbanSquare, tone: 'violet' as CrmTone },
    { to: '/crm/tarefas', label: 'Tarefas', icon: CheckSquare, tone: 'amber' as CrmTone },
    ...(manager
      ? [
          { to: '/crm/relatorio', label: 'Relatório', icon: BarChart3, tone: 'rose' as CrmTone },
          { to: '/crm/conexao', label: 'Conexão', icon: Smartphone, tone: 'sky' as CrmTone },
        ]
      : []),
  ];

  // Abas em coluna à esquerda (md+); o AdminLayout alarga o container na mesma medida
  return (
    <div className="md:flex md:items-start md:gap-4">
      {/* Fundo claro com manchas suaves de cor, atrás de todo o CRM */}
      <div aria-hidden className="crm-backdrop pointer-events-none fixed inset-0 -z-10" />
      <nav className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-zinc-200/70 bg-white/85 p-1 shadow-xs backdrop-blur md:sticky md:top-[58px] md:mb-0 md:w-[88px] md:flex-none md:flex-col md:overflow-visible md:rounded-2xl md:p-1.5">
        {tabs.map(({ to, label, icon: Icon, end, badge, tone }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                'md:flex-col md:gap-1 md:rounded-xl md:px-1 md:py-2 md:text-[11px]',
                isActive ? TONES[tone].active : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-lg transition-colors md:size-9 md:rounded-xl',
                    isActive ? cn(TONES[tone].solid, 'shadow-sm') : TONES[tone].tile,
                  )}
                >
                  <Icon className="size-4 md:size-[18px]" />
                </span>
                {label}
                {badge ? (
                  <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white md:absolute md:right-1 md:top-1 md:text-[10px]">
                    {badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 md:flex-1">
        <Outlet context={{ refreshUnread: unread.reload }} />
      </div>
      {alerts.data?.length ? <TaskAlerts alerts={alerts.data} onDismissed={() => void alerts.reload()} /> : null}
    </div>
  );
}

function TaskAlerts({ alerts, onDismissed }: { alerts: CrmTaskAlert[]; onDismissed: () => void }) {
  const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    try {
      await crmService.dismissTaskAlerts(alerts.map((a) => a.id));
      onDismissed();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      persistent
      busy={busy}
      title={alerts.length > 1 ? `${alerts.length} tarefas novas` : 'Tarefa nova'}
      onClose={() => void close()}
      footer={
        <>
          <Link to="/crm/tarefas" onClick={() => void close()} className="mr-auto self-center text-sm font-medium text-brand-600 hover:underline">
            Ver tarefas
          </Link>
          <Button onClick={() => void close()} loading={busy}>
            Fechar
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <div className="font-medium text-ink">{a.title}</div>
            {a.description ? <p className="mt-1 whitespace-pre-line text-sm text-zinc-600">{a.description}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
              {a.company_id ? (
                <Link to={`/crm/empresas/${a.company_id}`} onClick={() => void close()} className="text-brand-600 hover:underline">
                  {a.company_name}
                </Link>
              ) : null}
              {a.due_at ? (
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  {dateTime(a.due_at)}
                </span>
              ) : null}
              {a.assignee_name ? <span>Responsável: {a.assignee_name}</span> : null}
              {a.created_by_name ? <span>Criada por {a.created_by_name}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
