import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';

/**
 * Chaves de API da IA cadastradas pelo painel, com rodízio: cada uso pega a próxima
 * chave da fila (contador no banco, compartilhado entre as instâncias do servidor).
 * A chave da variável de ambiente, se existir, também participa do rodízio.
 */

export interface AIKey {
  /** null = chave da variável de ambiente */
  id: string | null;
  key: string;
  label: string;
}

export interface AIKeyInfo {
  id: string;
  label: string | null;
  last4: string;
  active: boolean;
  uses: number;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  /** Limite diário atingido: quando a cota do Google renova (ISO); null = sem limite atingido */
  quota_until?: string | null;
  /** Cota informada pelo RapidAPI na última resposta (ex.: requests, tokens) e quando foi lida */
  quota: Record<string, KeyQuota> | null;
  quota_at: string | null;
}

export interface KeyQuota {
  limit: number;
  remaining: number;
  /** Quando a cota renova (ISO) */
  reset_at: string | null;
}

/** Cota nos cabeçalhos x-ratelimit-<nome>-limit / -remaining / -reset (segundos até renovar) do RapidAPI. */
export function quotaFromHeaders(headers: Headers): Record<string, KeyQuota> | null {
  const out: Record<string, KeyQuota> = {};
  for (const [h, v] of headers.entries()) {
    const m = /^x-ratelimit-(.+)-limit$/i.exec(h);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const limit = Number(v);
    const remaining = Number(headers.get(`x-ratelimit-${name}-remaining`));
    const reset = Number(headers.get(`x-ratelimit-${name}-reset`));
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) continue;
    out[name] = { limit, remaining, reset_at: Number.isFinite(reset) && reset > 0 ? new Date(Date.now() + reset * 1000).toISOString() : null };
  }
  return Object.keys(out).length ? out : null;
}

// Criptografia simétrica derivada do segredo do servidor
function cipherKey(secret = env.jwtSecret) {
  return crypto.createHash('sha256').update(`lp-ai-keys:${secret}`).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload: string): string | null {
  // Durante a troca do segredo, o que foi gravado com o anterior ainda abre
  return decryptWith(payload, env.jwtSecret) ?? (env.jwtSecretPrevious ? decryptWith(payload, env.jwtSecretPrevious) : null);
}

function decryptWith(payload: string, secret: string): string | null {
  try {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(secret), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null; // segredo do servidor mudou: a chave precisa ser cadastrada de novo
  }
}

/**
 * Troca do segredo (JWT_SECRET_PREVIOUS definido): regrava com o segredo novo tudo o que ainda está
 * criptografado com o anterior (chaves de IA/RapidAPI, chave da Evolution, acesso ao Google Drive).
 * Roda na inicialização; quando nada mais usa o anterior, JWT_SECRET_PREVIOUS pode ser apagado.
 */
export async function reencryptWithCurrentSecret() {
  if (!env.jwtSecretPrevious) return;
  const previous = env.jwtSecretPrevious;
  const redo = async (table: string, column: string, idColumn: string, extraWhere = '') => {
    const { rows } = await query<{ id: string; v: string }>(
      `select ${idColumn}::text as id, ${column} as v from ${table} where ${column} is not null ${extraWhere}`,
    );
    for (const r of rows) {
      if (decryptWith(r.v, env.jwtSecret) !== null) continue;
      const plain = decryptWith(r.v, previous);
      if (plain !== null) await query(`update ${table} set ${column} = $2 where ${idColumn}::text = $1`, [r.id, encrypt(plain)]);
    }
  };
  await redo('ai_api_keys', 'key_encrypted', 'id');
  await redo('lp_crm_whatsapp', 'api_key_encrypted', 'organization_id');
  await redo('lp_settings', 'value', 'key', "and key = 'google_drive_refresh_token'");
}

/**
 * Erro curto e legível para o painel: as APIs devolvem JSON enorme ({"error":{"code":429,"message":"You exceeded…"}}).
 * Fica o código e a primeira frase da mensagem.
 */
export function shortError(raw: string): string {
  let text = raw;
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
    const e = parsed?.error ?? parsed;
    text = [e?.code ?? e?.status, e?.message].filter(Boolean).join(': ') || raw;
  } catch {
    /* não é JSON */
  }
  // Limite por segundo/minuto (RapidAPI: "exceeded the rate limit per second"): não é falta de cota
  if (/rate limit per (second|minute)|too many requests|requests per (second|minute)/i.test(text) && !/quota|monthly|daily|per (day|month|hour)/i.test(text)) {
    return 'Muitas consultas ao mesmo tempo (limite por segundo/minuto do plano). Não é falta de cota: o sistema espera e tenta de novo.';
  }
  if (/quota|exhausted|rate limit|429/i.test(text)) return 'Cota esgotada (limite de uso atingido). Tente mais tarde ou use outra chave.';
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Erro de cota (limite do plano atingido). */
export const QUOTA_ERROR = /\b429\b|quota|exhausted|rate.?limit/i;

/**
 * Início do "dia" da cota do Google: as cotas diárias do Gemini zeram à meia-noite do Pacífico
 * (America/Los_Angeles), ou seja, 4h ou 5h no horário de Brasília.
 */
export function lastQuotaReset(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const sinceMidnight = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

const hashKey = (key: string) => crypto.createHash('sha256').update(key.trim()).digest('hex');

/** Chave da variável de ambiente removida pelo painel (vale só para aquela chave: trocar a variável a traz de volta). */
const envKeyRemoved = (provider: string) => `${provider}_env_key_removed`;

/** Provedores com chaves cadastradas pelo painel. */
export const KEY_PROVIDERS = ['gemini', 'rapidapi', 'rapidapi_gemini', 'giphy'] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

export const aiKeyStore = {
  /** A chave da variável de ambiente, se não foi removida pelo painel. */
  async activeEnvKey(envKey?: string, provider: string = 'gemini'): Promise<string | undefined> {
    if (!envKey) return undefined;
    const row = await one<{ value: string }>('select value from lp_settings where key = $1', [envKeyRemoved(provider)]);
    return row?.value === hashKey(envKey) ? undefined : envKey;
  },

  async removeEnvKey(envKey: string, provider: string = 'gemini') {
    await query(
      `insert into lp_settings (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [envKeyRemoved(provider), hashKey(envKey)],
    );
  },

  async list(provider = 'gemini'): Promise<AIKeyInfo[]> {
    const { rows } = await query<AIKeyInfo>(
      `select id, label, last4, active, uses::int as uses, last_used_at, last_error, last_error_at, created_at, quota, quota_at
         from ai_api_keys where provider = $1 order by active desc, created_at`, // ativas primeiro
      [provider],
    );
    // Limite diário de antes da renovação da cota não vale mais: a chave volta a aparecer como disponível
    const reset = lastQuotaReset();
    const nextReset = new Date(reset.getTime() + 24 * 3600 * 1000).toISOString();
    return rows.map((r) => {
      // Renovação à meia-noite do Pacífico é regra do Google; a cota do RapidAPI segue o plano da API.
      const quota = provider === 'gemini' && !!r.last_error && QUOTA_ERROR.test(r.last_error);
      if (quota && r.last_error_at && new Date(r.last_error_at) < reset) return { ...r, last_error: null, last_error_at: null, quota_until: null };
      // Erros gravados antes do resumo também aparecem curtos
      return { ...r, last_error: r.last_error ? shortError(r.last_error) : null, quota_until: quota ? nextReset : null };
    });
  },

  /** Chave cadastrada já decifrada (para testar de novo pelo painel). */
  async get(id: string, provider: string): Promise<AIKey | null> {
    const r = await one<{ id: string; label: string | null; last4: string; key_encrypted: string }>(
      'select id, label, last4, key_encrypted from ai_api_keys where id = $1 and provider = $2',
      [id, provider],
    );
    if (!r) return null;
    const key = decrypt(r.key_encrypted);
    return key ? { id: r.id, key, label: r.label || `•••• ${r.last4}` } : null;
  },

  async exists(key: string) {
    return !!(await one('select 1 from ai_api_keys where key_hash = $1', [hashKey(key)]));
  },

  /** Onde esta chave já está cadastrada (provedor, nome e final), se estiver; a do provedor informado vem primeiro. */
  async findByKey(key: string, provider?: string) {
    return one<{ id: string; provider: string; label: string | null; last4: string }>(
      'select id, provider, label, last4 from ai_api_keys where key_hash = $1 order by (provider = $2) desc limit 1',
      [hashKey(key), provider ?? null],
    );
  },

  async add(input: { key: string; label?: string | null; userId?: string }, provider = 'gemini'): Promise<AIKeyInfo> {
    const key = input.key.trim();
    const row = await one<AIKeyInfo>(
      `insert into ai_api_keys (provider, label, key_encrypted, key_hash, last4, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, label, last4, active, uses::int as uses, last_used_at, last_error, last_error_at, created_at`,
      [provider, input.label?.trim() || null, encrypt(key), hashKey(key), key.slice(-4), input.userId ?? null],
    );
    return row!;
  },

  /** Passa uma chave para a lista de outro provedor (zera erros; o nome novo, se informado, substitui o antigo). */
  async moveTo(id: string, provider: string, label?: string | null): Promise<AIKeyInfo> {
    const row = await one<AIKeyInfo>(
      `update ai_api_keys set provider = $2, label = coalesce($3, label), active = true, last_error = null, last_error_at = null
        where id = $1
        returning id, label, last4, active, uses::int as uses, last_used_at, last_error, last_error_at, created_at`,
      [id, provider, label?.trim() || null],
    );
    return row!;
  },

  async update(id: string, patch: { active?: boolean; label?: string | null }) {
    const { rowCount } = await query(
      `update ai_api_keys set active = coalesce($2, active), label = case when $3::boolean then $4 else label end where id = $1`,
      [id, patch.active ?? null, patch.label !== undefined, patch.label?.trim() || null],
    );
    return !!rowCount;
  },

  async remove(id: string) {
    const { rowCount } = await query('delete from ai_api_keys where id = $1', [id]);
    return !!rowCount;
  },

  /** Há alguma chave utilizável (ambiente ou banco ativa)? */
  async hasAny(provider = 'gemini', envKey?: string) {
    if (await this.activeEnvKey(envKey, provider)) return true;
    return !!(await one('select 1 from ai_api_keys where provider = $1 and active limit 1', [provider]));
  },

  /**
   * Chaves na ordem de uso desta chamada: começa pela próxima do rodízio e segue as demais
   * (usadas só se a anterior falhar por cota ou chave inválida).
   */
  async rotation(provider = 'gemini', envKey?: string): Promise<AIKey[]> {
    const { rows } = await query<{ id: string; label: string | null; last4: string; key_encrypted: string }>(
      'select id, label, last4, key_encrypted from ai_api_keys where provider = $1 and active order by created_at',
      [provider],
    );
    const keys: AIKey[] = [];
    envKey = await this.activeEnvKey(envKey, provider);
    if (envKey) keys.push({ id: null, key: envKey, label: 'variável de ambiente' });
    for (const r of rows) {
      const key = decrypt(r.key_encrypted);
      if (key) keys.push({ id: r.id, key, label: r.label || `•••• ${r.last4}` });
      else await this.recordError(r.id, 'Não foi possível ler a chave (o segredo do servidor mudou). Cadastre-a novamente.');
    }
    if (keys.length <= 1) return keys;
    const counter = await one<{ counter: string }>(
      `insert into ai_key_rotation (provider, counter) values ($1, 1)
       on conflict (provider) do update set counter = ai_key_rotation.counter + 1
       returning counter`,
      [provider],
    );
    const start = (Number(counter?.counter ?? 1) - 1) % keys.length;
    return [...keys.slice(start), ...keys.slice(0, start)];
  },

  async recordUse(id: string | null) {
    if (!id) return;
    await query('update ai_api_keys set uses = uses + 1, last_used_at = now() where id = $1', [id]).catch(() => {});
  },

  async recordError(id: string | null, message: string) {
    if (!id) return;
    await query('update ai_api_keys set last_error = $2, last_error_at = now() where id = $1', [id, shortError(message)]).catch(() => {});
  },

  /**
   * Guarda a cota que o RapidAPI informou na resposta (a cada uso da chave, com sucesso ou erro).
   * `api`: chave usada em mais de uma API (pesquisa) — a cota de cada API fica separada ("<api> · tokens").
   */
  async recordQuota(key: string, headers: Headers, api?: string) {
    const quota = quotaFromHeaders(headers);
    if (!quota) return;
    const named = api ? Object.fromEntries(Object.entries(quota).map(([k, v]) => [`${api} · ${k}`, v])) : quota;
    await query(`update ai_api_keys set quota = ${api ? "coalesce(quota, '{}'::jsonb) || $2::jsonb" : '$2::jsonb'}, quota_at = now() where key_hash = $1`, [
      hashKey(key),
      JSON.stringify(named),
    ]).catch(() => {});
  },

  async clearError(id: string | null) {
    if (!id) return;
    await query('update ai_api_keys set last_error = null, last_error_at = null where id = $1', [id]).catch(() => {});
  },
};
