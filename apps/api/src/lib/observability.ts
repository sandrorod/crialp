/**
 * Observabilidade: erros e rastreamento (traces) da API.
 *
 * - SENTRY_DSN definido: Sentry (erros + desempenho). As etapas medidas com withSpan viram spans do Sentry
 *   (sem o hook de inicialização, como na função do Vercel, o Sentry não registra o provedor global do OTel).
 * - Sem Sentry e com OTEL_EXPORTER_OTLP_ENDPOINT: OpenTelemetry puro, exportando via OTLP para qualquer
 *   fornecedor (Datadog, New Relic, Grafana, Honeycomb…). Cabeçalhos em OTEL_EXPORTER_OTLP_HEADERS.
 * - Nenhum dos dois: desligado (só o console, como antes).
 */
import { context, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import * as Sentry from '@sentry/node';
import { waitUntil } from '@vercel/functions';

const SERVICE = process.env.OTEL_SERVICE_NAME || 'lp-api';
let mode: 'sentry' | 'otlp' | 'off' | null = null;
let otlpProvider: TracerProvider | null = null;

/** Dados que nunca saem do servidor: sessão, senhas e chaves de API. */
const SECRET_KEYS = /cookie|authorization|password|senha|token|secret|api[-_]?key|x-rapidapi-key/i;

function scrub<T>(value: T, depth = 0): T {
  if (!value || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? '[removido]' : scrub(v, depth + 1);
  return out as T;
}

/** Liga a observabilidade conforme as variáveis de ambiente. Chamar antes de criar o app (uma vez). */
export function initObservability() {
  if (mode) return mode;
  const release = process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_VERSION || undefined;
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release,
      environment,
      serverName: SERVICE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      // Sem dados pessoais: nada de usuário, cookies, corpo das requisições nem textos enviados à IA
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { deny: ['cookie', 'authorization', 'x-rapidapi-key'] }, response: false },
        httpBodies: [],
        genAI: { inputs: false, outputs: false },
      },
      beforeSend: (event) => {
        if (event.request) event.request = scrub(event.request);
        if (event.extra) event.extra = scrub(event.extra);
        return event;
      },
    });
    mode = 'sentry';
  } else if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    otlpProvider = new TracerProvider({
      resource: resourceFromAttributes({ 'service.name': SERVICE, 'service.version': release ?? 'dev', 'deployment.environment': environment }),
      spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
    });
    trace.setGlobalTracerProvider(otlpProvider);
    mode = 'otlp';
  } else {
    mode = 'off';
  }
  if (mode !== 'off') console.log(`[observabilidade] ${mode === 'sentry' ? 'Sentry' : `OpenTelemetry (OTLP) como "${SERVICE}"`} ativo`);
  return mode;
}

/** Erro inesperado (não é erro de validação nem de regra de negócio): vai para o Sentry com o contexto. */
export function captureError(err: unknown, extra?: Record<string, unknown>) {
  if (mode === 'sentry') {
    Sentry.withScope((scope) => {
      if (extra) scope.setContext('detalhes', scrub(extra));
      Sentry.captureException(err);
    });
    // Função do Vercel congela depois da resposta: o envio continua até terminar
    if (process.env.VERCEL) waitUntil(flushObservability());
  }
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(err instanceof Error ? err : String(err));
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

/**
 * Etapa medida (span OpenTelemetry), ex.: análise do site, geração pela IA. Erro na etapa marca o span
 * como erro e continua sendo lançado para quem chamou.
 */
/** Atributos de um span: só valores simples (nunca textos do usuário ou da IA). */
type SpanAttrs = Record<string, string | number | boolean>;

export async function withSpan<T>(name: string, attributes: SpanAttrs, fn: () => Promise<T>): Promise<T> {
  // Sentry marca o span como erro sozinho quando a função lança
  if (mode === 'sentry') return Sentry.startSpan({ name, op: name.split('.')[0], attributes }, fn);
  return trace.getTracer(SERVICE).startActiveSpan(name, { attributes }, async (span: Span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err instanceof Error ? err : String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Envia o que ainda está na fila (função do Vercel termina logo depois da resposta). */
export async function flushObservability(timeoutMs = 2000) {
  if (mode === 'sentry') await Sentry.flush(timeoutMs);
  else if (otlpProvider) await otlpProvider.forceFlush();
}
