import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, Field, Input, LoadingBlock } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService } from '@/services/crm';

const STATES: Record<string, { label: string; cls: string }> = {
  open: { label: 'Conectado', cls: 'bg-emerald-50 text-emerald-700' },
  connecting: { label: 'Aguardando leitura do QR Code', cls: 'bg-amber-50 text-amber-700' },
  close: { label: 'Desconectado', cls: 'bg-red-50 text-red-700' },
  missing: { label: 'Instância ainda não criada', cls: 'bg-zinc-100 text-zinc-600' },
  not_configured: { label: 'Não configurado', cls: 'bg-zinc-100 text-zinc-600' },
  error: { label: 'Erro ao consultar', cls: 'bg-red-50 text-red-700' },
};

export function CrmConnectionPage() {
  const { data: status, reload, setData } = useAsync(() => crmService.whatsapp(), []);
  const [form, setForm] = useState({ api_url: '', api_key: '', instance: 'crm' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (status?.configured) setForm((f) => ({ ...f, api_url: status.api_url ?? '', instance: status.instance ?? 'crm' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured]);

  // Enquanto o QR está na tela, acompanha até conectar
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => void crmService.whatsapp().then((s) => {
      setData(s);
      if (s.state === 'open') {
        setQr(null);
        toast.success('WhatsApp conectado.');
      }
    }).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [qr, setData]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await crmService.saveWhatsapp({ api_url: form.api_url, api_key: form.api_key || undefined, instance: form.instance });
      setForm((f) => ({ ...f, api_key: '' }));
      toast.success('Configuração salva.');
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const r = await crmService.connectWhatsapp();
      setQr(r.qrcode);
      if (r.state === 'open') toast.success('Já está conectado. Webhook atualizado.');
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const importHistory = async () => {
    setImporting({ done: 0, total: 0 });
    let offset: number | null = 0;
    let messages = 0;
    try {
      while (offset !== null) {
        const r = await crmService.importWhatsapp(offset);
        messages += r.messages;
        offset = r.next;
        setImporting({ done: r.next ?? r.total, total: r.total });
      }
      toast.success(messages ? `Conversas importadas (${messages} mensagens lidas).` : 'Nenhuma conversa nova para importar.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setImporting(null);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await crmService.logoutWhatsapp();
      setConfirmLogout(false);
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <LoadingBlock />;
  const st = STATES[status.state] ?? { label: status.state, cls: 'bg-zinc-100 text-zinc-600' };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="font-semibold text-ink">Servidor do WhatsApp (Evolution API)</h3>
        <p className="mt-1 text-sm text-zinc-500">Todos os vendedores usam este número central. Cada conversa aparece para o vendedor da empresa.</p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <Field label="URL da Evolution API" hint={/^http:\/\//i.test(form.api_url) ? 'Use o endereço com https:// — com http:// o servidor redireciona e o envio de mensagens falha.' : 'O endereço do servidor, sem /manager no final.'}>
            <Input required placeholder="https://whatsapp.suaempresa.com.br" value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value.trim().replace(/\/manager\/?$/, '') })} />
          </Field>
          <Field label="Chave da API (AUTHENTICATION_API_KEY)" hint={status.configured ? 'Deixe em branco para manter a chave atual.' : undefined}>
            <Input type="password" autoComplete="off" required={!status.configured} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
          </Field>
          <Field label="Nome da instância"><Input required value={form.instance} onChange={(e) => setForm({ ...form, instance: e.target.value })} /></Field>
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Smartphone className="size-5 text-zinc-400" />
          <div className="flex-1">
            <h3 className="font-semibold text-ink">Número conectado</h3>
            <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span>
            {status.error ? <p className="mt-1 text-xs text-red-600">{status.error}</p> : null}
          </div>
          <button onClick={() => void reload()} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Atualizar" title="Atualizar"><RefreshCw className="size-4" /></button>
        </div>

        {status.configured ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={status.state === 'open' ? 'secondary' : 'brand'} loading={busy} onClick={() => void connect()}>
              {status.state === 'open' ? 'Reconfigurar webhook' : qr ? 'Gerar novo QR Code' : 'Conectar WhatsApp'}
            </Button>
            {status.state === 'open' ? <Button variant="secondary" onClick={() => setConfirmLogout(true)}>Desconectar</Button> : null}
          </div>
        ) : null}
        {status.configured && status.state === 'open' ? (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <Button variant="secondary" loading={!!importing} onClick={() => void importHistory()}>
              {importing ? `Importando… ${importing.done}/${importing.total || '?'} conversas` : 'Importar conversas'}
            </Button>
            <p className="mt-1 text-xs text-zinc-500">
              Traz para o CRM as conversas que o servidor do WhatsApp já guardou (até 50 mensagens recentes de cada). As novas chegam sozinhas.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Faltando conversas antigas? Clique em Desconectar e conecte de novo: ao ler o QR Code o celular envia o histórico. Espere alguns minutos e importe outra vez.
            </p>
          </div>
        ) : null}
        {!status.configured ? <p className="mt-4 text-sm text-zinc-500">Preencha e salve a configuração ao lado para conectar.</p> : null}

        {qr && status.state !== 'open' ? (
          <div className="mt-4 text-center">
            <img src={qr} alt="QR Code do WhatsApp" className="mx-auto size-64" />
            <p className="mt-2 text-sm text-zinc-500">No celular do número central: WhatsApp → Aparelhos conectados → Conectar aparelho. O código expira em cerca de 1 minuto.</p>
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirmLogout}
        title="Desconectar o WhatsApp?"
        description="Ninguém conseguirá enviar ou receber mensagens pelo CRM até conectar de novo."
        confirmLabel="Desconectar"
        danger
        loading={busy}
        onConfirm={() => void logout()}
        onClose={() => setConfirmLogout(false)}
      />
    </div>
  );
}
