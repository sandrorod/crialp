/**
 * Erros e desempenho do painel no Sentry. Só liga com VITE_SENTRY_DSN no build; os relatórios vão pela
 * própria API (/api/monitoring), então a CSP do painel continua só com 'self'.
 */
import * as Sentry from '@sentry/react';
import type { RootOptions } from 'react-dom/client';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tunnel: '/api/monitoring',
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Liga o trace do navegador ao da API (mesmo endereço)
    tracePropagationTargets: [/^\/api\//],
    // Sem dados pessoais (nome, e-mail, cookies, IP)
    dataCollection: { userInfo: false, cookies: false },
  });
}

/** Erros de renderização do React (com ou sem tela de erro) também vão para o Sentry. */
export function rootErrorHandlers(): RootOptions {
  if (!dsn) return {};
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}
