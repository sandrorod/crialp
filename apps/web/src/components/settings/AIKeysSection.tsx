import { useState, type FormEvent } from 'react';
import { AlertTriangle, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, Field, Input, LoadingBlock, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { miscService, type KeyProvider } from '@/services';
import type { AIKeyInfo } from '@/types';

const PROVIDERS: Record<KeyProvider, { title: string; description: string; envVar: string; label: string; hint: string; placeholder: string }> = {
  gemini: {
    title: 'Chaves do Gemini',
    description: 'Cada uso da IA passa para a próxima chave ativa (rodízio). Se uma chave estiver sem cota ou inválida, a próxima é usada automaticamente.',
    envVar: 'GEMINI_API_KEY',
    label: 'Nova chave do Gemini',
    hint: 'Crie em aistudio.google.com/apikey. A chave é testada antes de salvar.',
    placeholder: 'AIza…',
  },
  rapidapi: {
    title: 'Chaves do RapidAPI',
    description: 'Usadas em "Buscar empresas". Cada pesquisa passa para a próxima chave ativa (rodízio); sem cota, inválida ou sem assinatura da API, a próxima é usada.',
    envVar: 'RAPIDAPI_KEY',
    label: 'Nova chave do RapidAPI',
    hint: 'Em rapidapi.com → seu app → "Authorization" (X-RapidAPI-Key). A chave é testada antes de salvar.',
    placeholder: '1a2b3c…msh…',
  },
};

/** Chaves de API com rodízio: cada uso passa para a próxima chave. */
export function AIKeysSection({ provider = 'gemini' }: { provider?: KeyProvider }) {
  const cfg = PROVIDERS[provider];
  const { data, error, loading, reload } = useAsync(() => miscService.apiKeys(provider), [provider]);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // id "env" = chave da variável de ambiente (sai do rodízio; a variável fica no servidor)
  const [toDelete, setToDelete] = useState<Pick<AIKeyInfo, 'id' | 'label' | 'last4'> | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await miscService.addApiKey(provider, key.trim(), label.trim());
      toast.success('Chave validada e adicionada ao rodízio.');
      setKey('');
      setLabel('');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (k: AIKeyInfo) => {
    setBusyId(k.id);
    try {
      await miscService.updateApiKey(provider, k.id, { active: !k.active });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      if (toDelete.id === 'env') await miscService.removeEnvApiKey(provider);
      else await miscService.removeApiKey(provider, toDelete.id);
      toast.success('Chave removida.');
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = (data?.keys.filter((k) => k.active).length ?? 0) + (data?.env_key ? 1 : 0);

  return (
    <CardSection
      title={cfg.title}
      description={cfg.description}
    >
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={3} />
      ) : data ? (
        <div className="space-y-4">
          {!data.provider_active ? (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="size-4 flex-none" /> O provedor de IA do servidor não é o Gemini: estas chaves só serão usadas quando AI_PROVIDER=gemini.
            </p>
          ) : null}

          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {data.env_key ? (
              <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <KeyRound className="size-4 flex-none text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Chave do servidor <span className="font-mono text-zinc-500">•••• {data.env_key.last4}</span></div>
                  <div className="text-xs text-zinc-500">Variável de ambiente {cfg.envVar} · no rodízio</div>
                </div>
                <button onClick={() => setToDelete({ id: 'env', label: 'Chave do servidor', last4: data.env_key!.last4 })} title="Remover chave" aria-label="Remover chave do servidor" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ) : null}
            {data.keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <KeyRound className="size-4 flex-none text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {k.label || 'Chave'} <span className="font-mono text-zinc-500">•••• {k.last4}</span>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {k.uses} {k.uses === 1 ? 'uso' : 'usos'} · {k.last_used_at ? `último uso ${formatDate(k.last_used_at, true)}` : 'ainda não usada'}
                  </div>
                  {k.last_error ? (
                    <div className="mt-0.5 line-clamp-2 break-words text-xs text-red-600 [overflow-wrap:anywhere]" title={k.last_error}>
                      Último erro ({formatDate(k.last_error_at, true)}): {k.last_error}
                    </div>
                  ) : null}
                </div>
                <StatusToggle status={k.active ? 'ativa' : 'inativa'} loading={busyId === k.id} onToggle={() => void toggle(k)} />
                <button onClick={() => setToDelete(k)} title="Remover chave" aria-label="Remover chave" className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            {!data.env_key && !data.keys.length ? <li className="px-3 py-4 text-center text-sm text-zinc-500">Nenhuma chave cadastrada.</li> : null}
          </ul>
          <p className="text-xs text-zinc-500">
            {activeCount} {activeCount === 1 ? 'chave ativa' : 'chaves ativas'} no rodízio.
          </p>

          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Field label={cfg.label} hint={cfg.hint}>
              <Input value={key} onChange={(e) => setKey(e.target.value)} required minLength={20} autoComplete="off" spellCheck={false} className="font-mono" placeholder={cfg.placeholder} />
            </Field>
            <Field label="Nome (opcional)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Ex.: Conta 2" />
            </Field>
            <Button type="submit" loading={adding} icon={<Plus className="size-4" />} className="sm:mb-[22px]">
              Adicionar
            </Button>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!toDelete}
        title="Remover chave?"
        description={
          <>
            A chave <strong>{toDelete?.label || 'sem nome'} (•••• {toDelete?.last4})</strong>{' '}
            {toDelete?.id === 'env'
              ? `sai do rodízio. Ela continua na variável ${cfg.envVar} do servidor, mas deixa de ser usada.`
              : 'sai do rodízio e é apagada do sistema.'}
          </>
        }
        confirmLabel="Remover"
        danger
        loading={!!toDelete && busyId === toDelete.id}
        onConfirm={() => void remove()}
        onClose={() => setToDelete(null)}
      />
    </CardSection>
  );
}
