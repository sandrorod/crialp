import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Field, Input, Modal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { authService } from '@/services';

/** "Minha conta": qualquer usuário troca o próprio nome e a senha (o e-mail de login não muda por aqui). */
export function MyAccountModal({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const nameChanged = name.trim() && name.trim() !== user?.name;
    const passwordChange = !!(current || next || confirm);
    if (passwordChange) {
      if (next.length < 8) return toast.error('A nova senha deve ter pelo menos 8 caracteres.');
      if (next !== confirm) return toast.error('A confirmação não confere com a nova senha.');
      if (!current) return toast.error('Informe a senha atual.');
    }
    if (!nameChanged && !passwordChange) return onClose();
    setSaving(true);
    try {
      if (nameChanged) {
        const r = await authService.updateName(name.trim());
        setUser(r.user);
      }
      if (passwordChange) await authService.changePassword(current, next);
      toast.success(passwordChange ? 'Dados e senha atualizados.' : 'Nome atualizado.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Minha conta"
      description={user?.email}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" form="my-account" loading={saving}>Salvar</Button>
        </>
      }
    >
      <form id="my-account" onSubmit={save} className="space-y-4">
        <Field label="Nome"><Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="border-t border-zinc-100 pt-4">
          <p className="mb-3 text-[13px] font-medium text-zinc-700">Trocar senha <span className="font-normal text-zinc-400">(deixe em branco para manter)</span></p>
          <div className="space-y-3">
            <Field label="Senha atual"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
            <Field label="Nova senha" hint="Mínimo de 8 caracteres."><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
            <Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
