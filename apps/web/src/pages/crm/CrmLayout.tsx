import { NavLink, Outlet } from 'react-router';
import { Building2, CheckSquare, KanbanSquare, MessageCircle, Smartphone } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { crmService } from '@/services/crm';
import { useEffect } from 'react';

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

  const tabs = [
    { to: '/crm', label: 'Empresas', icon: Building2, end: true },
    { to: '/crm/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: unread.data?.total ?? 0 },
    { to: '/crm/funil', label: 'Funil', icon: KanbanSquare },
    { to: '/crm/tarefas', label: 'Tarefas', icon: CheckSquare },
    ...(manager ? [{ to: '/crm/conexao', label: 'Conexão', icon: Smartphone }] : []),
  ];

  return (
    <>
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {tabs.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
                isActive ? 'border-ink text-ink' : 'border-transparent text-zinc-500 hover:text-ink',
              )
            }
          >
            <Icon className="size-4" />
            {label}
            {badge ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{badge}</span> : null}
          </NavLink>
        ))}
      </nav>
      <Outlet context={{ refreshUnread: unread.reload }} />
    </>
  );
}
