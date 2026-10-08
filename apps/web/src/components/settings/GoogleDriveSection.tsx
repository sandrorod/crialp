import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, ConfirmDialog, ErrorBlock, LoadingBlock } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { miscService } from '@/services';

/** Conexão com o Google Drive: a imagem (JPG) de cada LP gerada vai para a pasta "lp". */
export function GoogleDriveSection() {
  const { data, setData, error, loading, reload } = useAsync(() => miscService.driveStatus(), []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <CardSection title="Google Drive" description='A imagem (JPG) de cada Landing Page gerada é enviada para a pasta "lp" do Drive conectado.'>
      {error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {loading || !data ? (
        <LoadingBlock rows={2} />
      ) : !data.configured ? (
        <p className="text-sm text-zinc-500">
          Não configurado no servidor: defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET nas variáveis de ambiente.
        </p>
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
            {data.connected ? <Button variant="ghost" onClick={() => setConfirmOpen(true)}>Desconectar</Button> : null}
          </div>
        </div>
      )}
      {data?.configured ? (
        <p className="mt-5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
          O sistema só acessa os arquivos que ele mesmo cria no Drive. Endereço de retorno a cadastrar no Google Cloud: <span className="break-all font-mono">{data.redirect_uri}</span>
        </p>
      ) : null}
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
