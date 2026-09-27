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
      await landingPageService.setStatus(id, next);
      toast.success(next === 'ativa' ? 'Landing Page ativada.' : 'Landing Page desativada.');
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const copyUrl = async (url: string) => {
    if (await copyToClipboard(url)) toast.success('URL copiada.');
    else toast.error('Não foi possível copiar a URL.');
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
