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

// ─── Mensagens da Evolution ─────────────────────────────────────────

const TYPES: Record<string, string> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  documentWithCaptionMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  contactMessage: 'contact',
};
const IGNORED = new Set(['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'messageContextInfo']);

export const STATUS: Record<string, string> = {
  ERROR: 'error',
  PENDING: 'pending',
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
};

function messageText(m: any): string | null {
  const msg = m.message ?? {};
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    msg.documentMessage?.fileName ??
    msg.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.listResponseMessage?.title ??
    msg.templateButtonReplyMessage?.selectedDisplayText ??
    null
  );
}

function messageType(m: any): string | null {
  const t = m.messageType ?? Object.keys(m.message ?? {}).find((k) => !IGNORED.has(k));
  if (!t || IGNORED.has(t)) return null;
  return TYPES[t] ?? 'other';
}

/** JID de telefone; com endereçamento LID o número vem em campos alternativos. Grupos e status são ignorados. */
function phoneJid(m: any): string | null {
  const key = m.key ?? {};
  const jid: string = key.remoteJid ?? '';
  if (jid.endsWith('@s.whatsapp.net')) return jid;
  if (jid.endsWith('@lid')) {
    const alt: string | undefined = key.remoteJidAlt ?? key.senderPn ?? m.senderPn;
    if (alt) return alt.includes('@') ? alt : `${alt}@s.whatsapp.net`;
  }
  return null;
}

/** Mensagem da Evolution (webhook ou histórico) → dados para gravar; null para grupos, status e eventos sem conteúdo. */
export function parseEvolutionMessage(m: any): Omit<IncomingMessage, 'orgId'> | null {
  const jid = phoneJid(m);
  const type = jid ? messageType(m) : null;
  if (!jid || !type) return null;
  const fromMe = !!m.key?.fromMe;
  const ts = Number(m.messageTimestamp);
  return {
    phone: jidNumber(jid),
    remoteJid: jid,
    pushName: fromMe ? null : (m.pushName ?? null),
    direction: fromMe ? 'out' : 'in',
    type,
    body: messageText(m),
    waMessageId: m.key?.id ?? null,
    at: ts ? new Date(ts * 1000) : new Date(),
  };
}

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
           -- Mesmo número em mais de uma empresa: fica a empresa atual da conversa (ex.: a de quem enviou),
           -- enquanto ela ainda tiver esse número; senão, a cadastrada primeiro
           left join lateral (
             select id from companies
              where organization_id = c2.organization_id and ct.id is null
                and (lp_crm_wa_key(whatsapp) = c2.wa_key or lp_crm_wa_key(mobile) = c2.wa_key)
              order by (id = c2.company_id) desc, created_at limit 1
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
  /** Histórico importado: não conta como não lida */
  history?: boolean;
}

/** Grava a mensagem (idempotente pelo id do WhatsApp) e atualiza o resumo da conversa. */
export async function registerMessage(m: IncomingMessage): Promise<{ conversationId: string; inserted: boolean }> {
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
         unread = case when $6 then unread when $5 = 'in' then unread + 1 else 0 end
       where id = $1`,
      [conv.id, m.body, m.type, at, m.direction, !!m.history],
    );
  }
  return { conversationId: conv.id, inserted: !!msg?.inserted };
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

// ─── Importação do histórico guardado na Evolution ──────────────────

/** Conversas importadas por chamada (cada uma busca as mensagens dela): cabe no tempo de uma função da Vercel. */
export const IMPORT_BATCH = 10;
const IMPORT_MESSAGES_PER_CHAT = 50;

/**
 * Importa um lote das conversas individuais que a Evolution guardou (grupos ficam de fora) com as
 * últimas mensagens de cada uma. Idempotente: mensagens já gravadas (mesmo id do WhatsApp) são ignoradas.
 */
export async function importHistory(orgId: string, offset: number) {
  const cfg = await loadConfig(orgId);
  const raw = await evolution<any>(cfg, 'POST', `/chat/findChats/${cfg!.instance}`, {});
  const chats: any[] = (Array.isArray(raw) ? raw : raw?.chats ?? [])
    .filter((c: any) => {
      const jid = String(c.remoteJid ?? '');
      return jid.endsWith('@s.whatsapp.net') || (jid.endsWith('@lid') && !!c.lastMessage?.key?.remoteJidAlt);
    })
    .sort((a: any, b: any) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));

  let messages = 0;
  for (const chat of chats.slice(offset, offset + IMPORT_BATCH)) {
    const r = await evolution<any>(cfg, 'POST', `/chat/findMessages/${cfg!.instance}`, {
      where: { key: { remoteJid: chat.remoteJid } },
      page: 1,
      offset: IMPORT_MESSAGES_PER_CHAT,
    });
    const records: any[] = (r?.messages?.records ?? r?.records ?? [])
      .slice()
      .sort((a: any, b: any) => Number(a.messageTimestamp) - Number(b.messageTimestamp))
      .slice(-IMPORT_MESSAGES_PER_CHAT);
    for (const m of records) {
      // Mensagem antiga em conversa LID pode não trazer o número: usa o da conversa
      if (String(m.key?.remoteJid ?? '').endsWith('@lid') && !m.key?.remoteJidAlt) {
        m.key = { ...m.key, remoteJidAlt: chat.lastMessage?.key?.remoteJidAlt };
      }
      const parsed = parseEvolutionMessage(m);
      if (!parsed) continue;
      await registerMessage({ orgId, ...parsed, pushName: parsed.pushName ?? chat.pushName ?? null, history: true });
      messages++;
    }
  }
  const next = offset + IMPORT_BATCH;
  return { total: chats.length, next: next < chats.length ? next : null, messages };
}

// ─── Sincronização das mensagens recentes ───────────────────────────

const SYNC_MIN_INTERVAL = 5_000;
const lastSync = new Map<string, number>();

/**
 * Busca na Evolution as mensagens mais recentes de todas as conversas e grava as que faltam.
 * Garante o recebimento mesmo quando o webhook não alcança o sistema (ex.: rodando no computador)
 * ou um aviso se perde. Chamado pelas telas do CRM enquanto estão abertas; no máximo a cada 5 s por organização.
 */
export async function syncRecent(orgId: string): Promise<{ added: number; skipped?: string }> {
  const now = Date.now();
  if (now - (lastSync.get(orgId) ?? 0) < SYNC_MIN_INTERVAL) return { added: 0, skipped: 'recent' };
  lastSync.set(orgId, now);
  const cfg = await loadConfig(orgId);
  if (!cfg) return { added: 0, skipped: 'not_configured' };
  const r = await evolution<any>(cfg, 'POST', `/chat/findMessages/${cfg.instance}`, { where: {}, page: 1, offset: 50 });
  const records: any[] = (r?.messages?.records ?? []).slice().sort((a: any, b: any) => Number(a.messageTimestamp) - Number(b.messageTimestamp));
  let added = 0;
  for (const m of records) {
    const parsed = parseEvolutionMessage(m);
    if (!parsed) continue;
    if ((await registerMessage({ orgId, ...parsed })).inserted) added++;
  }
  return { added };
}
