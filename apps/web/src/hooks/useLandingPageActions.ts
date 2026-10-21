import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';
import { landingPageService } from '@/services';
import type { LpStatus } from '@/types';

/** Ações comuns de LP (ativar/desativar, copiar URL, excluir) com feedback. */
export function useLandingPageActions(onChange: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleStatus = async (id: string, current: LpStatus) => {
    setBusyId(id);
    try {
      const next = current === 'ativa' ? 'inativa' : 'ativa';
      const { screenshot } = await landingPageService.setStatus(id, next);
      // Ao ativar é gerado o print da página: confirma o envio ao Google Drive ou avisa o que falhou
      const sent = next === 'ativa' && screenshot?.drive_file_id && !screenshot.error && !screenshot.drive_error;
      toast.success(next === 'ativa' ? `Landing Page ativada${sent ? ' e print enviado ao Google Drive' : ''}.` : 'Landing Page desativada.');
      if (screenshot?.error) toast.warning(screenshot.error);
      else if (screenshot?.drive_error) toast.warning(screenshot.drive_error);
      else if (next === 'ativa' && !sent) toast.warning('O print da página não foi enviado ao Google Drive: use "Novo print" no editor da página.');
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const copyUrl = async (url: string) => {
    if (await copyToClipboard(url)) toast.success('Link da Landing Page copiado.');
    else toast.error('Não foi possível copiar o link.');
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await landingPageService.remove(id);
      toast.success('Landing Page excluída.');
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return { busyId, toggleStatus, copyUrl, remove };
}
