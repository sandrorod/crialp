import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { later } from '@/lib/backgroundTimer';
import { analysisService } from '@/services';
import type { Job } from '@/types';

/** Acompanha um processamento no servidor (análise ou geração) até concluir. */
export function useJob<T>(jobId: string | null) {
  const [job, setJob] = useState<Job<T> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    setNetworkError(null);
    setJob(null);
    if (!jobId) return;
    let active = true;
    let cancel = () => {};
    let failures = 0;
    const tick = async () => {
      try {
        const j = await analysisService.job<T>(jobId);
        if (!active) return;
        failures = 0;
        setNetworkError(null);
        setJob(j);
        if (j.status === 'done' || j.status === 'error') return;
      } catch (err) {
        if (!active) return;
        if (++failures >= 5) {
          setNetworkError(errorMessage(err));
          return;
        }
      }
      // Timer do Worker: com a aba em segundo plano a consulta segue no mesmo ritmo
      cancel = later(tick, 1200);
    };
    void tick();
    return () => {
      active = false;
      cancel();
    };
  }, [jobId]);

  return { job, networkError };
}
