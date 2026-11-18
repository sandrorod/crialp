import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authService } from '@/services';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Atualiza os dados da conta na tela (ex.: nome alterado) */
  setUser: (user: User) => void;
}

// No desenvolvimento, editar um arquivo importado aqui (ex.: services) reexecuta este módulo (HMR): reaproveita
// o mesmo contexto, senão o AuthProvider já montado fica com o antigo ("useAuth fora do AuthProvider")
const AuthContext: React.Context<AuthState | null> = import.meta.hot?.data.authContext ?? createContext<AuthState | null>(null);
if (import.meta.hot) import.meta.hot.data.authContext = AuthContext;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('lp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('lp:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await authService.login(email, password);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout().catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
