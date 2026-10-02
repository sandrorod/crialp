import { useState } from 'react';
import { Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { analysisService } from '@/services';

/** Botão "Interromper": para a análise/geração no servidor (nada é salvo depois da interrupção). */
export function StopJobButton({ jobId, onStopped }: { jobId: string | null; onStopped?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!jobId) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={busy}
      icon={<Square className="size-3.5 fill-current" />}
      onClick={async () => {
        setBusy(true);
        try {
          await analysisService.cancelJob(jobId);
          onStopped?.();
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      Interromper
    </Button>
  );
}
