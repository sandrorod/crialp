import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { clientLevelService, landingPageService } from '@/services';
import { Select } from '@/components/ui';
import { formatPrice } from '@/pages/ClientLevelsPage';

/** Níveis de cliente da organização; só administradores trocam o nível de uma página. */
export function useClientLevels() {
  const { user } = useAuth();
  const canAssign = user?.role === 'owner' || user?.role === 'admin';
  const { data } = useAsync(async () => (await clientLevelService.list()).map(({ id, name, price }) => ({ id, name, price })), []);
  return { levels: data ?? [], canAssign };
}

/** Nível de cliente da Landing Page (lista de páginas); administradores trocam pelo select. */
export function ClientLevelCell({
  landingPageId,
  levelId,
  levelName,
  levels,
  canAssign,
  onChanged,
}: {
  landingPageId: string;
  levelId: string | null;
  levelName: string | null;
  levels: { id: string; name: string }[];
  canAssign: boolean;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!canAssign || !levels.length) return <span className="text-zinc-600">{levelName ?? ''}</span>;

  const change = async (id: string | null) => {
    setSaving(true);
    try {
      await landingPageService.setClientLevel(landingPageId, id);
      toast.success('Nível do cliente alterado.');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={levelId ?? ''}
      disabled={saving}
      onChange={(e) => void change(e.target.value || null)}
      aria-label="Nível do cliente"
      className="max-w-[160px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
    >
      <option value="" />
      {levels.map((l) => (
        <option key={l.id} value={l.id}>{l.name}</option>
      ))}
    </select>
  );
}

/** Nível de cliente da LP que vai ser gerada ("" = sem nível). */
export function ClientLevelPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { levels, canAssign } = useClientLevels();
  if (!levels.length) {
    return canAssign ? (
      <p className="text-xs text-zinc-500">
        Nenhum nível de cliente cadastrado. <Link to="/niveis-cliente" className="font-medium text-ink underline-offset-2 hover:underline">Cadastrar níveis</Link>
      </p>
    ) : null;
  }
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">Nível do cliente</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1">
        <option value="">Sem nível</option>
        {levels.map((l) => (
          <option key={l.id} value={l.id}>{l.price != null ? `${l.name} — ${formatPrice(l.price)}` : l.name}</option>
        ))}
      </Select>
    </label>
  );
}
