import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, Field, Input, LoadingBlock } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { miscService, type DriveStatus } from '@/services';

/** Conexão com o Google Drive: a imagem (JPG) de cada LP gerada vai para a pasta escolhida (ou a pasta "lp"). */
export function GoogleDriveSection() {
  const { data, setData, error, loading, reload } = useAsync(() => miscService.driveStatus(), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const folderValue = folder ?? data?.target_folder_url ?? '';

  const saveFolder = async () => {
    setSavingFolder(true);
    try {
      const next = await miscService.setDriveFolder(folderValue.trim() || null);
      setData(next);
      setFolder(null);
      toast.success(next.target_folder ? 'Pasta do Google Drive salva.' : 'As imagens voltam para a pasta "lp".');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingFolder(false);
    }
  };

  // Retorno do login do Google: ?drive=ok | ?drive=erro
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('drive');
    if (!result) return;
    if (result === 'ok') toast.success('Google Drive conectado.');
    else toast.error('Não foi possível conectar o Google Drive. Tente de novo.');
    params.delete('drive');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  const disconnect = async () => {
    setBusy(true);
    try {
      setData(await miscService.disconnectDrive());
      toast.success('Google Drive desconectado.');
      setConfirmOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CardSection
      title="Google Drive"
      description='A imagem (JPG) de cada Landing Page gerada é enviada para a pasta escolhida abaixo (sem pasta escolhida, para a pasta "lp" criada pelo sistema).'
    >
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {loading || !data ? (
        <LoadingBlock rows={2} />
      ) : !data.configured ? (
        <p className="text-sm text-zinc-500">Cadastre a credencial do Google abaixo para conectar o Google Drive.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {data.connected ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-zinc-400" />}
            {data.connected ? `Conectado${data.email ? ` · ${data.email}` : ''}` : 'Não conectado'}
          </p>
          <div className="flex gap-2">
            <a href={miscService.driveConnectUrl}>
              <Button variant={data.connected ? 'secondary' : 'primary'}>{data.connected ? 'Trocar conta' : 'Conectar Google Drive'}</Button>
            </a>
            {data.connected ? (
              <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
                Desconectar
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {data?.configured ? (
        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="drive-folder">
            Pasta de destino
          </label>
          <div className="flex gap-2">
            <Input
              id="drive-folder"
              value={folderValue}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="Cole o link da pasta (https://drive.google.com/drive/folders/…)"
            />
            <Button onClick={saveFolder} loading={savingFolder} disabled={folder === null}>
              Salvar
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">A conta conectada precisa poder editar a pasta. Deixe vazio para usar a pasta "lp".</p>
        </div>
      ) : null}
      {data?.configured ? (
        <p className="mt-5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
          Depois de trocar a pasta ou atualizar o sistema, clique em "Trocar conta" para dar acesso de novo. Endereço de retorno a cadastrar no Google Cloud:{' '}
          <span className="break-all font-mono">{data.redirect_uri}</span>
        </p>
      ) : null}
      {data ? <DriveCredential status={data} onChange={setData} /> : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Desconectar o Google Drive?"
        description="As próximas imagens não serão enviadas ao Drive. Os arquivos que já estão lá continuam."
        confirmLabel="Desconectar"
        loading={busy}
        onConfirm={disconnect}
        onClose={() => setConfirmOpen(false)}
      />
    </CardSection>
  );
}

/**
 * Credencial do Google (OAuth: ID do cliente e chave secreta), criada no Google Cloud → APIs e serviços → Credenciais.
 * A cadastrada aqui vale no lugar das variáveis da Vercel; trocar desconecta a conta (é preciso conectar de novo).
 */
function DriveCredential({ status, onChange }: { status: DriveStatus; onChange: (s: DriveStatus) => void }) {
  const cred = status.credential;
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const open = editing || !cred;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      onChange(await miscService.setDriveCredentials(clientId.trim(), secret.trim()));
      toast.success('Credencial do Google salva. Agora clique em "Conectar Google Drive".');
      setEditing(false);
      setClientId('');
      setSecret('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const next = await miscService.removeDriveCredentials();
      onChange(next);
      toast.success(next.credential ? 'Voltou a usar a credencial das variáveis da Vercel.' : 'Credencial removida.');
      setConfirmRemove(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <KeyRound className="size-4 flex-none text-zinc-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Credencial do Google</p>
          <p className="break-all text-xs text-zinc-500">
            {cred ? (
              <>
                <span className="font-mono">{cred.client_id}</span> · <span className="whitespace-nowrap">chave secreta •••• {cred.secret_last4}</span> ·{' '}
                {cred.source === 'painel' ? 'cadastrada aqui' : 'das variáveis da Vercel'}
              </>
            ) : (
              'Nenhuma cadastrada.'
            )}
          </p>
        </div>
        {cred && !editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Alterar credencial
            </Button>
            {cred.source === 'painel' ? (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remover
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {open ? (
        <form onSubmit={save} className="mt-3 grid gap-3">
          <Field label="ID do cliente" hint='Google Cloud → APIs e serviços → Credenciais → ID do cliente OAuth (termina em ".apps.googleusercontent.com").'>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              placeholder="123456789-abc….apps.googleusercontent.com"
            />
          </Field>
          <Field label="Chave secreta do cliente" hint="Fica guardada criptografada; depois de salva, só aparecem os 4 últimos caracteres.">
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              required
              autoComplete="new-password"
              spellCheck={false}
              className="font-mono"
              placeholder="GOCSPX-…"
            />
          </Field>
          <p className="text-xs text-zinc-500">
            No Google Cloud, cadastre em "URIs de redirecionamento autorizados" o endereço <span className="break-all font-mono">{status.redirect_uri}</span>.{' '}
            {status.connected ? 'Ao salvar, a conta conectada sai e é preciso conectar de novo.' : null}
          </p>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              Salvar credencial
            </Button>
            {cred ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        title="Remover a credencial cadastrada aqui?"
        description="O sistema volta a usar a credencial das variáveis da Vercel (se houver) e a conta conectada sai: é preciso conectar de novo."
        confirmLabel="Remover"
        loading={saving}
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
