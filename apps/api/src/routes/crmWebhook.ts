import { Router } from 'express';
import { uuidParam } from '../lib/validation.js';
import { ingestEvolutionRecord, markRevoked, STATUS, updateMessageStatus, validWebhookToken } from '../services/crm/whatsapp.js';

/** Eventos da Evolution API (sem sessão: autenticado pelo token da URL). */
export const crmWebhookRouter = Router();

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
  } else if (event === 'messages.update') {
    for (const u of list) {
      const id = u.keyId ?? u.key?.id ?? u.messageId;
      const status = STATUS[String(u.status ?? u.update?.status ?? '').toUpperCase()];
      if (id && status) await updateMessageStatus(orgId.data, id, status);
    }
  }
  res.json({ ok: true });
});
