import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { analysisService } from '@/services';
import type { Job } from '@/types';

/** Acompanha um processamento no servidor (análise ou geração) até concluir. */
export function useJob<T>(jobId: string | null) {
  const [job, setJob] = useState<Job<T> | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
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
      timer = setTimeout(tick, 1200);
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId]);

  return { job, networkError };
}
