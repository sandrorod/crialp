import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { one, query } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { decrypt, encrypt } from '../ai/keyStore.js';

// ─── Configuração da Evolution API (por organização) ────────────────

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

export async function loadConfig(orgId: string): Promise<EvolutionConfig | null> {
  const r = await one<{ api_url: string; api_key_encrypted: string; instance: string }>(
    'select api_url, api_key_encrypted, instance from lp_crm_whatsapp where organization_id = $1',
    [orgId],
  );
  const apiKey = r ? decrypt(r.api_key_encrypted) : null;
  return r && apiKey ? { apiUrl: r.api_url, apiKey, instance: r.instance } : null;
}

export async function saveConfig(orgId: string, apiUrl: string, apiKey: string | null, instance: string) {
  const url = apiUrl.replace(/\/+$/, '');
  if (apiKey) {
    await query(
      `insert into lp_crm_whatsapp (organization_id, api_url, api_key_encrypted, instance) values ($1, $2, $3, $4)
       on conflict (organization_id) do update set api_url = excluded.api_url, api_key_encrypted = excluded.api_key_encrypted,
         instance = excluded.instance, updated_at = now()`,
      [orgId, url, encrypt(apiKey), instance],
    );
  } else {
    const { rowCount } = await query('update lp_crm_whatsapp set api_url = $2, instance = $3, updated_at = now() where organization_id = $1', [orgId, url, instance]);
    if (!rowCount) throw new AppError(400, 'Informe a chave da API.', 'BAD_REQUEST');
  }
}

/** Token do webhook derivado do segredo do sistema: nada para guardar nem vazar no banco. */
export function webhookToken(orgId: string) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`lp-crm-webhook:${orgId}`).digest('hex').slice(0, 40);
}

export function webhookUrl(orgId: string) {
  return `${env.appUrl}/api/crm-webhook/${orgId}?token=${webhookToken(orgId)}`;
}

export function validWebhookToken(orgId: string, token: string) {
  const expected = Buffer.from(webhookToken(orgId));
  const got = Buffer.from(token);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

const notConfigured = () => new AppError(400, 'Configure a conexão com o WhatsApp (Evolution API) na aba Conexão.', 'CRM_WA_NOT_CONFIGURED');

export async function evolution<T = any>(cfg: EvolutionConfig | null, method: string, path: string, body?: unknown): Promise<T> {
  if (!cfg) throw notConfigured();
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}${path}`, {
      method,
      headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(502, 'Não foi possível falar com o servidor do WhatsApp (Evolution API). Confira a URL.', 'CRM_WA_UNREACHABLE');
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    const msg = data?.response?.message ?? data?.message ?? text;
    console.error(`[crm] evolution ${method} ${path} → ${res.status}`, msg);
    throw Object.assign(new AppError(502, res.status === 401 ? 'Chave da Evolution API recusada.' : 'O servidor do WhatsApp recusou a operação.', 'CRM_WA_ERROR'), {
      evolutionStatus: res.status,
      evolutionMessage: JSON.stringify(msg),
    });
  }
  return data as T;
}

// ─── Números ────────────────────────────────────────────────────────

/** Só dígitos; números BR sem DDI (10/11 dígitos) recebem 55. */
export function normalizeNumber(value: string) {
  const d = value.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export const jidNumber = (jid: string) => jid.split('@')[0].split(':')[0];

// ─── Conversas ──────────────────────────────────────────────────────

/**
 * Liga conversas ao contato (pelo WhatsApp do contato) ou, sem contato, à empresa
 * (pelo WhatsApp/celular cadastrado nela). `onlyUnlinked` revisa só as conversas sem empresa.
 */
export async function relinkConversations(orgId: string, opts: { conversationId?: string; onlyUnlinked?: boolean } = {}) {
  await query(
    `update lp_crm_conversations cv set contact_id = m.contact_id, company_id = m.company_id
       from (
         select c2.id, ct.id as contact_id, coalesce(ct.company_id, co.id) as company_id
           from lp_crm_conversations c2
           left join lateral (
             select id, company_id from lp_crm_contacts where organization_id = c2.organization_id and wa_key = c2.wa_key limit 1
           ) ct on true
           left join lateral (
             select id from companies
              where organization_id = c2.organization_id and ct.id is null
                and (lp_crm_wa_key(whatsapp) = c2.wa_key or lp_crm_wa_key(mobile) = c2.wa_key)
              order by created_at limit 1
           ) co on true
          where c2.organization_id = $1
            and ($2::uuid is null or c2.id = $2)
            and (not $3 or c2.company_id is null)
       ) m
      where cv.id = m.id and (cv.contact_id is distinct from m.contact_id or cv.company_id is distinct from m.company_id)`,
    [orgId, opts.conversationId ?? null, !!opts.onlyUnlinked],
  );
}

export interface IncomingMessage {
  orgId: string;
  phone: string;
  remoteJid: string | null;
  pushName: string | null;
  direction: 'in' | 'out';
  type: string;
  body: string | null;
  waMessageId: string | null;
  sentBy?: string | null;
  at?: Date;
  status?: string;
}

/** Grava a mensagem (idempotente pelo id do WhatsApp) e atualiza o resumo da conversa. */
export async function registerMessage(m: IncomingMessage): Promise<string> {
  const conv = await one<{ id: string; inserted: boolean }>(
    `insert into lp_crm_conversations (organization_id, phone, remote_jid, push_name) values ($1, $2, $3, $4)
     on conflict (organization_id, wa_key) do update set
       remote_jid = coalesce(excluded.remote_jid, lp_crm_conversations.remote_jid),
       push_name = coalesce(excluded.push_name, lp_crm_conversations.push_name)
     returning id, (xmax = 0) as inserted`,
    [m.orgId, m.phone, m.remoteJid, m.direction === 'in' ? m.pushName : null],
  );
  if (!conv) throw new Error('falha ao gravar conversa');
  if (conv.inserted) await relinkConversations(m.orgId, { conversationId: conv.id });

  const at = m.at ?? new Date();
  const msg = await one<{ inserted: boolean }>(
    `insert into lp_crm_messages (conversation_id, direction, type, body, wa_message_id, status, sent_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (wa_message_id) do update set sent_by = coalesce(lp_crm_messages.sent_by, excluded.sent_by)
     returning (xmax = 0) as inserted`,
    [conv.id, m.direction, m.type, m.body, m.waMessageId, m.status ?? (m.direction === 'in' ? 'received' : 'sent'), m.sentBy ?? null, at],
  );
  if (msg?.inserted) {
    await query(
      `update lp_crm_conversations set
         last_message = left(coalesce($2, '[' || $3 || ']'), 200),
         last_message_at = greatest(coalesce(last_message_at, '-infinity'), $4),
         unread = case when $5 = 'in' then unread + 1 else 0 end
       where id = $1`,
      [conv.id, m.body, m.type, at, m.direction],
    );
  }
  return conv.id;
}

const STATUS_RANK = ['error', 'pending', 'sent', 'delivered', 'read'];

/** Atualiza o status de entrega sem nunca rebaixar (eventos podem chegar fora de ordem). */
export async function updateMessageStatus(waMessageId: string, status: string) {
  await query(
    `update lp_crm_messages set status = $2
      where wa_message_id = $1
        and array_position($3::text[], $2) > coalesce(array_position($3::text[], status), 0)`,
    [waMessageId, status, STATUS_RANK],
  );
}
