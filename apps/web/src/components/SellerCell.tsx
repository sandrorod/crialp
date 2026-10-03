import { useState } from 'react';
import { toast } from 'sonner';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { landingPageService, userService } from '@/services';

export type Seller = { id: string; name: string };

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

/** Vendedor responsável pela Landing Page; administradores podem trocar ali mesmo. */
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
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!landingPageId) return <span className="text-zinc-400">—</span>;
  if (!canAssign || !sellers.length) return <span className={sellerName ? 'text-zinc-600' : 'text-zinc-400'}>{sellerName ?? 'Sem vendedor'}</span>;

  const change = async (id: string) => {
    setSaving(true);
    try {
      await landingPageService.setSeller(landingPageId, id);
      toast.success('Vendedor responsável alterado.');
      onChanged();
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
      onChange={(e) => e.target.value && void change(e.target.value)}
      aria-label="Vendedor responsável"
      className="max-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
    >
      {sellerId ? null : <option value="">Sem vendedor</option>}
      {sellers.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
