import type { RapidGeminiConfig } from '@/services';

/**
 * Lê o que o RapidAPI mostra numa API: o "MCP configuration" (JSON com mcpServers / mcp-remote e os
 * cabeçalhos x-api-host / x-api-key) ou o código do Playground (cURL, fetch, axios, Python…).
 * Devolve só o que encontrou: host, chave e, no Playground, caminho e formato do corpo.
 */
export interface RapidSnippetInfo {
  host?: string;
  key?: string;
  config?: Partial<RapidGeminiConfig>;
}

const HOST_RE = /([a-z0-9-]+(?:\.[a-z0-9-]+)*\.p\.rapidapi\.com)/i;

/** Primeiro objeto { … } balanceado a partir de `from` (respeita strings). */
function balancedObject(text: string, from: number): string | null {
  const start = text.indexOf('{', from);
  if (start < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Objeto JS/Python/PHP "quase JSON" → JSON (chaves sem aspas, aspas simples, True/None, vírgula sobrando). */
function looseJson(src: string): unknown {
  try {
    return JSON.parse(src);
  } catch {
    const fixed = src
      .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, s: string) => JSON.stringify(s.replace(/\\'/g, "'")))
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/=>/g, ':')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

/** Corpo do pedido no código do Playground. */
function findBody(text: string): Record<string, unknown> | null {
  const markers = [/--data(?:-raw)?\s+/, /\s-d\s+/, /\bbody\s*:\s*JSON\.stringify\(/, /\bbody\s*:/, /\bdata\s*:/, /\bpayload\s*=/, /\bjson\s*=/, /\bdata\s*=/, /CURLOPT_POSTFIELDS\s*=>/];
  for (const m of markers) {
    const found = m.exec(text);
    if (!found) continue;
    const obj = balancedObject(text, found.index + found[0].length);
    if (!obj) continue;
    try {
      const parsed = looseJson(obj);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}

/** Corpo sem formato conhecido: troca o texto do exemplo por {{prompt}}. */
function toTemplate(body: Record<string, unknown>): string | null {
  const preferred = ['prompt', 'text', 'content', 'query', 'question', 'message', 'input', 'q'];
  let best: { path: (string | number)[]; score: number } | null = null;
  const walk = (node: unknown, path: (string | number)[]) => {
    if (typeof node === 'string') {
      const last = path[path.length - 1];
      const score = (typeof last === 'string' && preferred.includes(last.toLowerCase()) ? 1000 : 0) + node.length;
      if (!best || score > best.score) best = { path, score };
    } else if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...path, i]));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
  };
  walk(body, []);
  if (!best) return null;
  const copy = JSON.parse(JSON.stringify(body));
  let target = copy;
  const p = (best as { path: (string | number)[] }).path;
  for (const k of p.slice(0, -1)) target = target[k];
  target[p[p.length - 1]] = '{{prompt}}';
  return JSON.stringify(copy);
}

export function parseRapidSnippet(raw: string): RapidSnippetInfo {
  const text = raw.trim();
  const info: RapidSnippetInfo = {};
  info.key = /x-(?:rapid)?api-key["'\s]*[:=,]\s*["']?\s*([A-Za-z0-9]{30,})/i.exec(text)?.[1];
  info.host = /x-(?:rapid)?api-host["'\s]*[:=,]\s*["']?\s*([a-z0-9.-]+\.p\.rapidapi\.com)/i.exec(text)?.[1]?.toLowerCase() ?? HOST_RE.exec(text)?.[1]?.toLowerCase();
  if (!info.host) return info;

  const config: Partial<RapidGeminiConfig> = { host: info.host };
  // Caminho: URL do Playground (no MCP configuration não vem — fica o atual)
  const url = new RegExp(`https?://${info.host.replace(/\./g, '\\.')}(/[^\\s'"\`?]*)?`, 'i').exec(text);
  if (url) config.path = url[1] || '/';

  const body = findBody(text);
  if (body) {
    if (Array.isArray(body.contents)) {
      config.format = 'google';
    } else if (Array.isArray(body.messages)) {
      config.format = 'openai';
      if (typeof body.model === 'string') config.model = body.model;
      const { messages: _m, model: _model, ...extra } = body;
      config.template = Object.keys(extra).length ? JSON.stringify(extra) : '';
    } else {
      const template = toTemplate(body);
      if (template) {
        config.format = 'template';
        config.template = template;
      }
    }
  }
  info.config = config;
  return info;
}
