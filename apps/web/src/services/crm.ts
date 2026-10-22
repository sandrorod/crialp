import { api } from '@/lib/api';
import type {
  CrmCompanyDetail,
  CrmCompanyItem,
  CrmContact,
  CrmConversation,
  CrmDeal,
  CrmMessage,
  CrmStage,
  CrmTask,
  CrmUser,
  CrmWhatsAppStatus,
} from '@/types/crm';

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
};

export type ContactInput = Omit<CrmContact, 'id'>;
export type DealInput = { company_id: string; contact_id: string | null; stage_id: string; title: string; value: number; expected_close: string | null; notes: string | null };
export type SendTo = { conversation_id?: string; contact_id?: string; company_id?: string };
export type OutgoingMedia = { kind: 'image' | 'gif' | 'video' | 'audio' | 'document'; mime: string; file_name?: string; data: string; caption?: string };
export type StageInput = { name: string; color: string; kind: 'open' | 'won' | 'lost' };
export type TaskInput = { title: string; description: string | null; due_at: string | null; company_id: string | null; assignee_id: string | null };

export const crmService = {
  users: () => api.get<CrmUser[]>('/crm/users'),
  companies: (f: { search?: string; seller?: string }) => api.get<CrmCompanyItem[]>(`/crm/companies${qs(f)}`),
  company: (id: string) => api.get<CrmCompanyDetail>(`/crm/companies/${id}`),

  contact: (id: string) => api.get<CrmContact & { company_name: string }>(`/crm/contacts/${id}`),
  createContact: (c: ContactInput) => api.post<CrmContact>('/crm/contacts', c),
  updateContact: (id: string, c: ContactInput) => api.put<CrmContact>(`/crm/contacts/${id}`, c),
  removeContact: (id: string) => api.del(`/crm/contacts/${id}`),

  stages: () => api.get<CrmStage[]>('/crm/stages'),
  createStage: (st: StageInput) => api.post<CrmStage>('/crm/stages', st),
  updateStage: (id: string, st: StageInput) => api.put(`/crm/stages/${id}`, st),
  reorderStages: (ids: string[]) => api.put('/crm/stages-order', { ids }),
  removeStage: (id: string, moveTo?: string) => api.del<{ moved: number }>(`/crm/stages/${id}${moveTo ? `?move_to=${moveTo}` : ''}`),
  deals: (f: { seller?: string }) => api.get<CrmDeal[]>(`/crm/deals${qs(f)}`),
  createDeal: (d: DealInput) => api.post<CrmDeal>('/crm/deals', d),
  updateDeal: (id: string, d: DealInput) => api.put<CrmDeal>(`/crm/deals/${id}`, d),
  moveDeal: (id: string, stage_id: string) => api.patch(`/crm/deals/${id}/move`, { stage_id }),
  removeDeal: (id: string) => api.del(`/crm/deals/${id}`),

  tasks: (f: { done?: string; due_from?: string; due_to?: string; assignee?: string }) => api.get<CrmTask[]>(`/crm/tasks${qs(f)}`),
  createTask: (t: TaskInput) => api.post<CrmTask>('/crm/tasks', t),
  updateTask: (id: string, t: TaskInput) => api.put<CrmTask>(`/crm/tasks/${id}`, t),
  setTaskDone: (id: string, done: boolean) => api.patch(`/crm/tasks/${id}/done`, { done }),
  removeTask: (id: string) => api.del(`/crm/tasks/${id}`),

  conversations: (unlinked?: boolean) => api.get<CrmConversation[]>(`/crm/conversations${unlinked ? '?unlinked=true' : ''}`),
  whatsappTargets: (search?: string) =>
    api.get<{
      companies: { id: string; name: string; whatsapp: string; city: string | null }[];
      contacts: { id: string; name: string; whatsapp: string; company_name: string }[];
    }>(`/crm/whatsapp-targets${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  sync: () => api.post<{ added: number; skipped?: string }>('/crm/sync'),
  unread: () => api.get<{ total: number }>('/crm/unread'),
  messages: (conversationId: string) => api.get<CrmMessage[]>(`/crm/conversations/${conversationId}/messages`),
  react: (messageId: string, emoji: string) => api.post(`/crm/messages/${messageId}/reaction`, { emoji }),
  markRead: (conversationId: string) => api.post(`/crm/conversations/${conversationId}/read`),
  send: (to: SendTo, text: string) => api.post<{ conversation_id: string }>('/crm/messages', { ...to, text }),
  sendMedia: (to: SendTo, media: OutgoingMedia) => api.post<{ conversation_id: string }>('/crm/messages/media', { ...to, ...media }),
  /** Endereço do arquivo de uma mensagem com mídia (exige login; o servidor confere o acesso à conversa). */
  mediaUrl: (messageId: string) => `/api/crm/media/${messageId}`,

  whatsapp: () => api.get<CrmWhatsAppStatus>('/crm/whatsapp'),
  saveWhatsapp: (c: { api_url: string; api_key?: string; instance: string }) => api.put('/crm/whatsapp', c),
  connectWhatsapp: () => api.post<{ state: string; qrcode: string | null }>('/crm/whatsapp/connect'),
  importWhatsapp: (offset: number) => api.post<{ total: number; next: number | null; messages: number }>('/crm/whatsapp/import', { offset }),
  logoutWhatsapp: () => api.post('/crm/whatsapp/logout'),
};

// ─── Formatação ─────────────────────────────────────────────────────

export const money = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function phone(v: string | null | undefined) {
  if (!v) return '';
  let d = v.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Mesma chave do banco (lp_crm_wa_key): 55 + DDD + 8 últimos dígitos, por causa do 9º dígito do WhatsApp. */
export function waKey(v: string | null | undefined) {
  let d = (v ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!d) return null;
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? `55${d.slice(2, 4)}${d.slice(-8)}` : d;
}

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
