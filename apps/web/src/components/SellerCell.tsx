import { useState } from 'react';
import { toast } from 'sonner';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { landingPageService, userService } from '@/services';
import { Select } from '@/components/ui';

export type Seller = { id: string | null; name: string | null };

/** Vendedores da organização (só administradores conseguem listar; os demais recebem lista vazia). */
export function useSellers() {
  const { user } = useAuth();
  const isManager = user?.role === 'owner' || user?.role === 'admin';
  const { data } = useAsync(
    async () => (isManager ? (await userService.list()).filter((u) => u.role === 'seller').map(({ id, name }) => ({ id, name })) : []),
    [isManager],
  );
  return { sellers: data ?? [], canAssign: isManager };
}

/** Vendedor responsável pela Landing Page (editor da página); administradores trocam pelo select. */
export function SellerCell({
  landingPageId,
  sellerId,
  sellerName,
  sellers,
  canAssign,
  onChanged,
}: {
  landingPageId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  sellers: Seller[];
  canAssign: boolean;
  onChanged: (seller: Seller) => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!landingPageId) return <span className="text-zinc-400">—</span>;
  if (!canAssign || !sellers.length) return <span className="text-zinc-600">{sellerName ?? ''}</span>;

  const change = async (id: string | null) => {
    setSaving(true);
    try {
      await landingPageService.setSeller(landingPageId, id);
      toast.success('Vendedor responsável alterado.');
      onChanged(sellers.find((s) => s.id === id) ?? { id: null, name: null });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={sellerId ?? ''}
      disabled={saving}
      onChange={(e) => void change(e.target.value || null)}
      aria-label="Vendedor responsável"
      className="max-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
    >
      {/* Sem vendedor salvo: opção vazia (escolhê-la de novo limpa o vendedor) */}
      <option value="" />
      {sellers.map((s) => (
        <option key={s.id} value={s.id!}>{s.name}</option>
      ))}
    </select>
  );
}

/** Vendedor da LP que vai ser gerada ("auto" = rodízio, "" = sem vendedor). Só aparece para administradores com vendedores cadastrados. */
export function SellerPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { sellers, canAssign } = useSellers();
  if (!canAssign || !sellers.length) return null;
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">Vendedor</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1">
        <option value="auto">Aleatório</option>
        <option value="">Sem vendedor</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id!}>{s.name}</option>
        ))}
      </Select>
    </label>
  );
}
