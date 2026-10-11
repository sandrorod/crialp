import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, Field, Input, LoadingBlock, Select, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { ApiError, errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { miscService, type KeyProvider, type RapidGeminiConfig } from '@/services';
import type { AIKeyInfo } from '@/types';

const PROVIDERS: Record<KeyProvider, { name: string; title: string; description: string; envVar: string; label: string; hint: string; placeholder: string }> = {
  gemini: {
    name: 'Chave do Gemini',
    title: 'Chaves do Gemini',
    description:
      'Cada uso da IA passa para a próxima chave ativa (rodízio). Se uma chave estiver sem cota ou inválida, a próxima é usada automaticamente. ' +
      'Atenção: o limite diário do plano gratuito é por projeto do Google, não por chave. Várias chaves do mesmo projeto dividem o mesmo limite; para somar limite, crie as chaves em contas (ou projetos) diferentes.',
    envVar: 'GEMINI_API_KEY',
    label: 'Nova chave do Gemini',
    hint: 'Crie em aistudio.google.com/apikey. A chave é testada antes de salvar.',
    placeholder: 'AIza…',
  },
  rapidapi: {
    name: 'Chave do RapidAPI (Maps)',
    title: 'Chaves do RapidAPI — Maps',
    description: 'Para o Google Maps: usadas em "Buscar empresas" e nas fotos do perfil da empresa no Google. Cada pesquisa passa para a próxima chave ativa (rodízio); sem cota, inválida ou sem assinatura da API, a próxima é usada.',
    envVar: 'RAPIDAPI_KEY',
    label: 'Nova chave do RapidAPI (Maps)',
    hint: 'Em rapidapi.com → seu app → "Authorization" (X-RapidAPI-Key). A chave é testada antes de salvar.',
    placeholder: '1a2b3c…msh…',
  },
  rapidapi_gemini: {
    name: 'Chave do RapidAPI (Gemini)',
    title: 'Chaves do RapidAPI — Gemini',
    description:
      'Substituem as chaves do Gemini quando elas estão todas desativadas: gerar e analisar LPs e, se a API repassar a consulta ao Google Maps, ler e pesquisar locais. ' +
      'Cada uso passa para a próxima chave ativa (rodízio). A mesma chave do RapidAPI pode estar também em "Chaves do RapidAPI — Maps".',
    envVar: '',
    label: 'Nova chave do RapidAPI (Gemini)',
    hint: 'Assine uma API de Gemini no rapidapi.com e preencha o host dela acima. A chave é testada antes de salvar.',
    placeholder: '1a2b3c…msh…',
  },
};

/** Qual API de Gemini do RapidAPI usar (cada uma tem host e formato próprios). */
function RapidGeminiConfigForm() {
  const { data, error, loading, reload } = useAsync(() => miscService.rapidGeminiConfig(), []);
  const [form, setForm] = useState<RapidGeminiConfig | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      setForm(await miscService.saveRapidGeminiConfig(form));
      toast.success('API do RapidAPI (Gemini) salva.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading || !form) return <LoadingBlock rows={1} />;
  return (
    <form onSubmit={save} className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
      <Field label="X-RapidAPI-Host" hint="Na página da API no RapidAPI → Endpoints → cabeçalhos do exemplo.">
        <Input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="algo.p.rapidapi.com" />
      </Field>
      <Field label="Caminho do endpoint" hint="Parte depois do host na URL do exemplo (POST).">
        <Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/" />
      </Field>
      <Field label="Formato do pedido" hint={'"Google" = corpo com contents/parts; "OpenAI" = corpo com messages.'}>
        <Select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as RapidGeminiConfig['format'] })}>
          <option value="google">Google (contents)</option>
          <option value="openai">OpenAI (messages)</option>
        </Select>
      </Field>
      <Field label="Modelo" hint="Enviado no formato OpenAI.">
        <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gemini-2.5-flash" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={saving} variant="secondary">
          Salvar API
        </Button>
      </div>
    </form>
  );
}

/** Chaves de API com rodízio: cada uso passa para a próxima chave. */
export function AIKeysSection({ provider = 'gemini' }: { provider?: KeyProvider }) {
  const cfg = PROVIDERS[provider];
  const { data, error, loading, reload } = useAsync(() => miscService.apiKeys(provider), [provider]);
  // Chave movida de uma lista para a outra: as duas seções recarregam
  useEffect(() => {
    const h = () => void reload();
    window.addEventListener('lp-keys-changed', h);
    return () => window.removeEventListener('lp-keys-changed', h);
  }, [reload]);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Chave recém-adicionada fica destacada na lista
  const [newId, setNewId] = useState<string | null>(null);
  // id "env" = chave da variável de ambiente (sai do rodízio; a variável fica no servidor)
  const [toDelete, setToDelete] = useState<Pick<AIKeyInfo, 'id' | 'label' | 'last4'> | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const created = await miscService.addApiKey(provider, key.trim(), label.trim());
      setNewId(created.id);
      showKey(created.id);
      toast.success(
        created.moved_from
          ? `A chave •••• ${created.last4} estava em "${created.moved_from}" e foi movida para "${cfg.title}".`
          : `Chave •••• ${created.last4} validada e adicionada à lista "${cfg.title}".`,
      );
      if (created.moved_from) window.dispatchEvent(new Event('lp-keys-changed'));
      setKey('');
      setLabel('');
    } catch (err) {
      toast.error(errorMessage(err));
      // Chave já cadastrada: mostra onde ela está
      if (err instanceof ApiError && err.code === 'KEY_EXISTS' && err.details?.provider === provider) {
        setNewId(String(err.details.id));
        showKey(String(err.details.id));
      }
    } finally {
      setAdding(false);
    }
  };

  /** Rola a tela até a chave na lista (depois de recarregar) para ela ficar visível. */
  const showKey = (id: string) => {
    void reload().then(() =>
      requestAnimationFrame(() => document.getElementById(`key-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })),
    );
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

          {provider === 'rapidapi_gemini' ? <RapidGeminiConfigForm /> : null}

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
              <li key={k.id} id={`key-${k.id}`} className={cn('flex items-center gap-3 px-3 py-2.5 text-sm', k.id === newId && 'bg-emerald-50')}>
                <KeyRound className="size-4 flex-none text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {k.label || cfg.name} <span className="font-mono text-zinc-500">•••• {k.last4}</span>
                    {k.id === newId ? <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Esta chave</span> : null}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Cadastrada em {formatDate(k.created_at, true)} · {k.uses} {k.uses === 1 ? 'uso' : 'usos'} · {k.last_used_at ? `último uso ${formatDate(k.last_used_at, true)}` : 'ainda não usada'}
                  </div>
                  {k.quota_until ? (
                    <div className="mt-0.5 text-xs text-amber-700" title={k.last_error ?? undefined}>
                      Limite diário do Google atingido ({formatDate(k.last_error_at, true)}). Libera em {formatDate(k.quota_until, true)}.
                    </div>
                  ) : k.last_error ? (
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
