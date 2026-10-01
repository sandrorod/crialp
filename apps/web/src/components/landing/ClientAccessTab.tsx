import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, ConfirmDialog, ErrorBlock, Field, Input, LoadingBlock } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { authService, landingPageService } from '@/services';

/** Login do cliente: entra no painel e só vê e edita esta Landing Page. */
export function ClientAccessTab({ lpId }: { lpId: string }) {
  const { data, error, loading, reload } = useAsync(() => landingPageService.clientAccess(lpId), [lpId]);
  const client = data?.client ?? null;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setName(client?.name ?? '');
    setEmail(client?.email ?? '');
    setPassword('');
  }, [client]);

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock rows={3} />;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await landingPageService.saveClientAccess(lpId, { name: name.trim() || undefined, email, password: password || undefined });
      toast.success(client ? 'Acesso do cliente atualizado.' : 'Acesso do cliente criado.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await landingPageService.removeClientAccess(lpId);
      toast.success('Acesso do cliente removido.');
      setRemoveOpen(false);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1 text-sm font-semibold">Acesso do cliente</h4>
        <p className="text-xs text-zinc-500">
          Com este e-mail e senha o cliente entra em <strong>{window.location.origin}/admin</strong> e vê apenas este site: edita textos, fotos, cores e
          seções e salva. Publicar, desativar, excluir, trocar o endereço e regenerar continuam só com a sua equipe.
        </p>
      </div>
      {client ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Acesso ativo{client.last_login_at ? ` · último acesso ${formatDate(client.last_login_at, true)}` : ' · ainda não entrou'}
        </p>
      ) : null}
      <form onSubmit={save} className="space-y-3">
        <Field label="Nome do cliente">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria (Clínica Sorriso)" />
        </Field>
        <Field label="E-mail de login">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={client ? 'Nova senha' : 'Senha'} hint={client ? 'Deixe em branco para manter a senha atual.' : 'Mínimo de 8 caracteres.'}>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required={!client} minLength={8} autoComplete="new-password" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving} icon={<KeyRound className="size-4" />}>{client ? 'Salvar acesso' : 'Criar acesso'}</Button>
          {client ? <Button type="button" variant="ghost" onClick={() => setRemoveOpen(true)} icon={<Trash2 className="size-4" />}>Remover acesso</Button> : null}
        </div>
      </form>
      <ConfirmDialog
        open={removeOpen}
        title="Remover acesso do cliente?"
        description="O cliente não conseguirá mais entrar no painel. O site não é alterado."
        confirmLabel="Remover"
        danger
        loading={removing}
        onConfirm={remove}
        onClose={() => setRemoveOpen(false)}
      />
    </div>
  );
}

/** Versão do próprio cliente: muda o nome e a senha; o e-mail de login é fixo. */
export function OwnAccessTab() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  if (!user) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const r = await authService.updateName(name);
      setUser({ ...user, ...r.user });
      toast.success('Nome atualizado.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await authService.changePassword(current, next);
      toast.success('Senha alterada.');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={saveName} className="space-y-3">
        <h4 className="text-sm font-semibold">Seus dados</h4>
        <Field label="E-mail de login" hint="O e-mail não pode ser alterado. Para trocar, fale com o administrador.">
          <Input value={user.email} disabled className="bg-zinc-50 text-zinc-500" />
        </Field>
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Button type="submit" loading={savingName} disabled={!name.trim() || name.trim() === user.name}>Salvar nome</Button>
      </form>
      <form onSubmit={savePassword} className="space-y-3 border-t border-zinc-100 pt-5">
        <h4 className="text-sm font-semibold">Alterar senha</h4>
        <Field label="Senha atual">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" loading={savingPassword} icon={<KeyRound className="size-4" />}>Alterar senha</Button>
      </form>
    </div>
  );
}
