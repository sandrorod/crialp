import { useState, type FormEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ErrorBlock, Field, Input, LoadingBlock, PageHeader } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { authService, miscService } from '@/services';
import { AIKeysSection } from '@/components/settings/AIKeysSection';
import { GoogleDriveSection } from '@/components/settings/GoogleDriveSection';
import { useAuth } from '@/hooks/useAuth';

export function SettingsPage() {
  const { data, error, loading, reload } = useAsync(() => miscService.settings(), []);
  const { user } = useAuth();
  const canManageKeys = user?.role === 'owner' || user?.role === 'admin';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authService.changePassword(current, next);
      toast.success('Senha alterada.');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Configurações" description="Ambiente, integrações e conta." />
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4">
        <CardSection title="Sistema">
          {loading || !data ? (
            <LoadingBlock rows={3} />
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-zinc-500">Inteligência artificial</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-medium">
                  {data.ai.configured ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}
                  {data.ai.configured ? `${data.ai.provider} · ${data.ai.model}` : 'Não configurada (cadastre uma chave abaixo ou defina no .env)'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">URL pública do sistema</dt>
                <dd className="mt-1 font-medium">{data.app_url}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Armazenamento de arquivos</dt>
                <dd className="mt-1 font-medium">{data.storage === 'local' ? 'Disco local (/uploads)' : data.storage}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Ambiente</dt>
                <dd className="mt-1 font-medium capitalize">{data.environment}</dd>
              </div>
            </dl>
          )}
          <p className="mt-5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
            Chaves de API ficam no servidor (variáveis de ambiente ou criptografadas no banco) e nunca são enviadas ao navegador.
          </p>
        </CardSection>

        {canManageKeys ? <AIKeysSection provider="gemini" /> : null}
        {canManageKeys ? <AIKeysSection provider="rapidapi" /> : null}
        {canManageKeys ? <GoogleDriveSection /> : null}

        <CardSection title="Alterar senha" description={data ? `${data.user.name} · ${data.user.email}` : undefined}>
          <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
            <Field label="Senha atual">
              <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
              <Input type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>Alterar senha</Button>
            </div>
          </form>
        </CardSection>
      </div>
    </>
  );
}
