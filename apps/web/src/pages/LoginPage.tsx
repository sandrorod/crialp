import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { homeFor } from '@/components/layout/AdminLayout';
import { errorMessage } from '@/lib/api';

/** Página do painel para onde voltar depois do login (?from=/empresas), só caminhos internos. */
function returnPath() {
  const from = new URLSearchParams(window.location.search).get('from');
  return from?.startsWith('/') && !from.startsWith('//') ? from : null;
}

/** O login fica em /lps (fora de /admin): entrando, segue para o painel em /admin. */
const toPanel = (path: string) => window.location.replace(`/admin${path}`);

/** Rota /admin/login antiga e acesso ao painel sem sessão: vão para o login em /lps, lembrando a página. */
export function LoginRedirect() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  useEffect(() => {
    window.location.replace(from && from !== '/' ? `/lps?from=${encodeURIComponent(from)}` : '/lps');
  }, [from]);
  return null;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) toPanel(returnPath() ?? homeFor(user));
  }, [user]);
  if (user) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = await login(email, password);
      toPanel(returnPath() ?? homeFor(u));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-white text-sm font-bold text-ink">LP</div>
          <span className="font-semibold">Landing Pages</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Da URL à Landing Page profissional em minutos.</h2>
          <p className="mt-4 text-zinc-400">
            Informe o site de uma empresa. A IA coleta e organiza as informações reais, você revisa, e o sistema publica uma página pronta para converter.
          </p>
        </div>
        <p className="relative text-xs text-zinc-500">Somente informações encontradas na fonte. Nada inventado.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="grid size-10 place-items-center rounded-lg bg-ink text-sm font-bold text-white">LP</div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Entrar no painel</h1>
          <p className="mt-1 text-sm text-zinc-500">Acesso restrito a administradores.</p>
          <div className="mt-8 space-y-4">
            <Field label="E-mail">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Senha">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Entrar <ArrowRight className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
