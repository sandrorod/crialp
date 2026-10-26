import { Router } from 'express';
import { uuidParam } from '../lib/validation.js';
import { one } from '../db/pool.js';
import { applyProtocolMessage, ingestEvolutionRecord, markRevoked, STATUS, updateMessageStatus, validWebhookToken } from '../services/crm/whatsapp.js';

/** Eventos da Evolution API (sem sessão: autenticado pelo token da URL). */
export const crmWebhookRouter = Router();

/**
 * Figurinha animada do CRM (GIF convertido) para a Evolution baixar: link terminado em ".gif" (é como ela
 * reconhece figurinha animada), id aleatório e validade de 15 minutos. Fora disso, 404.
 */
crmWebhookRouter.get('/sticker/:file', async (req, res) => {
  const m = /^([0-9a-f-]{36})\.gif$/i.exec(String(req.params.file));
  const id = m && uuidParam.safeParse(m[1]).success ? m[1] : null;
  const row = id
    ? await one<{ data: Buffer }>(`select data from lp_crm_sticker_files where id = $1 and created_at > now() - interval '15 minutes'`, [id])
    : null;
  if (!row) return res.status(404).end();
  res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(row.data);
});

crmWebhookRouter.post('/:orgId', async (req, res) => {
  const orgId = uuidParam.safeParse(req.params.orgId);
  const token = String(req.query.token ?? '');
  if (!orgId.success || !validWebhookToken(orgId.data, token)) return res.status(401).json({ error: 'unauthorized' });

  // Evolution manda "messages.upsert" ou "MESSAGES_UPSERT" conforme a configuração
  const event = String(req.body?.event ?? '')
    .toLowerCase()
    .replace(/_/g, '.');
  const data = req.body?.data;
  const list: any[] = Array.isArray(data) ? data : (data?.messages ?? (data ? [data] : []));

  if (event === 'messages.upsert') {
    for (const m of list) await ingestEvolutionRecord(orgId.data, m);
  } else if (event === 'messages.delete') {
    // Mensagem apagada para todos (a Evolution manda a chave dela)
    for (const d of list) {
      const id = d.id ?? d.keyId ?? d.key?.id;
      if (id) await markRevoked(orgId.data, id);
    }
  } else if (event === 'messages.edited' || event === 'send.message.update') {
    // Mensagem editada (pelo cliente ou pelo celular): a Evolution manda o protocolMessage com a chave da original
    for (const d of list) await applyProtocolMessage(orgId.data, d?.message?.protocolMessage ?? d);
  } else if (event === 'messages.update') {
    for (const u of list) {
      const id = u.keyId ?? u.key?.id ?? u.messageId;
      const status = STATUS[String(u.status ?? u.update?.status ?? '').toUpperCase()];
      if (id && status) await updateMessageStatus(orgId.data, id, status);
    }
  }
  res.json({ ok: true });
});
