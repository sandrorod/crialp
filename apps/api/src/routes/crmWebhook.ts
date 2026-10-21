import { Router } from 'express';
import { uuidParam } from '../lib/validation.js';
import { jidNumber, registerMessage, updateMessageStatus, validWebhookToken } from '../services/crm/whatsapp.js';

/** Eventos da Evolution API (sem sessão: autenticado pelo token da URL). */
export const crmWebhookRouter = Router();

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

const STATUS: Record<string, string> = {
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

crmWebhookRouter.post('/:orgId', async (req, res) => {
  const orgId = uuidParam.safeParse(req.params.orgId);
  const token = String(req.query.token ?? '');
  if (!orgId.success || !validWebhookToken(orgId.data, token)) return res.status(401).json({ error: 'unauthorized' });

  // Evolution manda "messages.upsert" ou "MESSAGES_UPSERT" conforme a configuração
  const event = String(req.body?.event ?? '').toLowerCase().replace(/_/g, '.');
  const data = req.body?.data;
  const list: any[] = Array.isArray(data) ? data : data?.messages ?? (data ? [data] : []);

  if (event === 'messages.upsert') {
    for (const m of list) {
      const jid = phoneJid(m);
      const type = jid ? messageType(m) : null;
      if (!jid || !type) continue;
      const fromMe = !!m.key?.fromMe;
      const ts = Number(m.messageTimestamp);
      await registerMessage({
        orgId: orgId.data,
        phone: jidNumber(jid),
        remoteJid: jid,
        pushName: m.pushName ?? null,
        direction: fromMe ? 'out' : 'in',
        type,
        body: messageText(m),
        waMessageId: m.key?.id ?? null,
        at: ts ? new Date(ts * 1000) : new Date(),
      });
    }
  } else if (event === 'messages.update') {
    for (const u of list) {
      const id = u.keyId ?? u.key?.id ?? u.messageId;
      const status = STATUS[String(u.status ?? u.update?.status ?? '').toUpperCase()];
      if (id && status) await updateMessageStatus(id, status);
    }
  }
  res.json({ ok: true });
});
