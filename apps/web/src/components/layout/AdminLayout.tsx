import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { Briefcase, Building2, LayoutDashboard, LogOut, Menu, PanelsTopLeft, Plus, Search, Settings, Users, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui';
import type { User, UserRole } from '@/types';

type Role = UserRole;
const MANAGERS: Role[] = ['owner', 'admin'];
const STAFF: Role[] = ['owner', 'admin', 'editor'];

// "roles": quem vê o item no menu (e pode abrir a rota)
const NAV: { to: string; label: string; icon: typeof Building2; end?: boolean; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: STAFF },
  { to: '/empresas', label: 'Empresas', icon: Building2, roles: STAFF },
  { to: '/landing-pages', label: 'Landing Pages', icon: PanelsTopLeft, roles: STAFF },
  { to: '/nova', label: 'Criar Landing Page', icon: Plus, roles: STAFF },
  { to: '/buscar', label: 'Buscar empresas', icon: Search, roles: STAFF },
  { to: '/vendas', label: 'Vendas', icon: Briefcase, roles: [...STAFF, 'seller'] },
  { to: '/subusuarios', label: 'Subusuários', icon: Users, roles: MANAGERS },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: STAFF },
];

/** Endereço do editor do site do cliente. */
const clientHome = (user: User) => `/landing-pages/${user.landing_page_id ?? ''}`;

/** Rota inicial de cada tipo de conta. */
export function homeFor(user: User) {
  if (user.role === 'client') return clientHome(user);
  return user.role === 'seller' ? '/vendas' : '/';
}

/** A rota atual é permitida para a conta? (subrotas como /empresas/:id seguem o item do menu) */
function canAccess(user: User, pathname: string) {
  // Cliente só abre o editor do próprio site
  if (user.role === 'client') return !!user.landing_page_id && pathname === clientHome(user);
  const role = user.role;
  const item = NAV.filter((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return item ? item.roles.includes(role) : STAFF.includes(role);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="grid size-8 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">LP</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Landing Pages</div>
          <div className="text-[11px] text-zinc-500">Geração com IA</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {(user?.role === 'client' ? [{ to: clientHome(user), label: 'Meu site', icon: PanelsTopLeft, end: true }] : NAV.filter((n) => user && n.roles.includes(user.role))).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink',
              )
            }
          >
            <Icon className="size-[18px]" strokeWidth={1.9} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid size-8 flex-none place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{user?.name}</div>
            <div className="truncate text-[11px] text-zinc-500">{user?.email}</div>
          </div>
          <button onClick={() => void logout()} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-ink" title="Sair" aria-label="Sair">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role === 'client' && !user.landing_page_id) {
    return <div className="grid min-h-screen place-items-center p-6 text-center text-sm text-zinc-500">Esta conta não está ligada a nenhum site. Fale com o administrador.</div>;
  }
  if (!canAccess(user, location.pathname)) return <Navigate to={homeFor(user)} replace />;

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200/80 bg-white lg:block">
        <Sidebar />
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-ink text-[11px] font-bold text-white">LP</div>
          <span className="text-sm font-semibold">Landing Pages</span>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-zinc-100" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-950/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Fechar menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
