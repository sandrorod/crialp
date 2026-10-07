import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, EmptyState, ErrorBlock, Field, Input, LoadingBlock, Modal, PageHeader, Select } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { userService } from '@/services';
import type { SubUser, UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Administrador principal',
  admin: 'Administrador',
  editor: 'Editor',
  seller: 'Vendedor',
  client: 'Cliente',
};

const ROLE_HINTS: Record<'admin' | 'seller', string> = {
  admin: 'Acesso completo: empresas, Landing Pages, vendas e subusuários.',
  seller: 'Acessa apenas a área Vendas: vê as empresas e registra prospecções.',
};

export function UsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useAsync(() => userService.list(), []);
  const [editing, setEditing] = useState<SubUser | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SubUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await userService.remove(toDelete.id);
      toast.success('Subusuário excluído.');
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Subusuários"
        description="Crie contas de Administrador ou Vendedor para a sua equipe."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Novo subusuário</Button>}
      />

      <Card>
        {error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <LoadingBlock />
        ) : !data?.length ? (
          <EmptyState icon={<Users className="size-5" />} title="Nenhum usuário" description="Crie o primeiro subusuário." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Nome</th>
                  <th className="px-3 py-3">E-mail</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Último acesso</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.map((u) => {
                  const isMe = u.id === me?.id;
                  const locked = u.role === 'owner' && !isMe;
                  return (
                    <tr key={u.id} className="transition hover:bg-zinc-50/70">
                      <td className="px-5 py-3.5 font-medium text-ink">
                        {u.name} {isMe ? <span className="ml-1 text-xs font-normal text-zinc-400">(você)</span> : null}
                      </td>
                      <td data-label="E-mail" className="px-3 py-3.5 text-zinc-600">{u.email}</td>
                      <td data-label="Tipo" className="px-3 py-3.5">
                        <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', u.role === 'seller' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-700')}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td data-label="Último acesso" className="px-3 py-3.5 text-zinc-500">{u.last_login_at ? formatDate(u.last_login_at, true) : 'Nunca acessou'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          {!locked ? (
                            <button onClick={() => setEditing(u)} title="Editar" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
                              <Pencil className="size-4" />
                            </button>
                          ) : null}
                          {!isMe && u.role !== 'owner' ? (
                            <button onClick={() => setToDelete(u)} title="Excluir" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <UserFormModal
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        target={editing}
        isSelf={editing !== 'new' && editing?.id === me?.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir subusuário?"
        description={<><strong>{toDelete?.name}</strong> perde o acesso ao sistema. As prospecções registradas por ele continuam no histórico.</>}
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}

function UserFormModal({ target, isSelf, onClose, onSaved }: { target: SubUser | 'new' | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const isNew = target === 'new';
  const existing = target && target !== 'new' ? target : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<'admin' | 'seller'>(existing?.role === 'seller' ? 'seller' : isNew ? 'seller' : 'admin');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // O tipo da própria conta e da conta principal não pode ser alterado
  const roleLocked = isSelf || existing?.role === 'owner' || existing?.role === 'editor';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        await userService.create({ name, email, password, role });
        toast.success('Subusuário criado.', { description: `Envie o e-mail e a senha para ${name.split(' ')[0]}.` });
      } else if (existing) {
        await userService.update(existing.id, {
          name,
          email,
          ...(roleLocked ? {} : { role }),
          ...(password ? { password } : {}),
        });
        toast.success('Subusuário atualizado.');
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={isNew ? 'Novo subusuário' : 'Editar subusuário'}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="user-form" loading={saving}>{isNew ? 'Criar conta' : 'Salvar'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Tipo de conta">
          {roleLocked ? (
            <Input value={existing ? ROLE_LABELS[existing.role] : ''} disabled />
          ) : (
            <Select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'seller')}>
              <option value="seller">Vendedor</option>
              <option value="admin">Administrador</option>
            </Select>
          )}
        </Field>
        {!roleLocked ? <p className="-mt-2 text-xs text-zinc-500">{ROLE_HINTS[role]}</p> : null}
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="E-mail (login)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="off" />
        </Field>
        <Field label={isNew ? 'Senha' : 'Nova senha'} hint={isNew ? 'Mínimo de 8 caracteres.' : 'Deixe em branco para manter a senha atual.'}>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required={isNew} minLength={8} maxLength={200} autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  );
}
