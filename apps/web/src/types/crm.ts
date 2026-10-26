export interface CrmUser {
  id: string;
  name: string;
  role: string;
}

/** Quem pode iniciar conversa com número fora do cadastro (o dono sempre pode). */
export interface CrmFreeNumberUser extends CrmUser {
  allowed: boolean;
}

export interface CrmCompanyItem {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  whatsapp: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  seller_names: string | null;
  /** Prospecção preenchida: os vendedores veem a empresa */
  prospecting: boolean;
  contacts: number;
  open_deals: number;
  open_value: number;
  pending_tasks: number;
  unread: number;
}

export interface CrmContact {
  id: string;
  company_id: string;
  name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
}

export interface CrmStage {
  id: string;
  name: string;
  position: number;
  color: string;
  kind: 'open' | 'won' | 'lost';
}

export interface CrmDeal {
  id: string;
  company_id: string;
  contact_id: string | null;
  stage_id: string;
  title: string;
  value: string | number;
  expected_close: string | null;
  notes: string | null;
  position: number;
  company_name?: string;
  contact_name?: string | null;
  stage_name?: string;
  stage_color?: string;
}

export interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  company_id: string | null;
  assignee_id: string;
  assignee_name?: string | null;
  company_name?: string | null;
}

/** Tarefa nova ainda não fechada no popup do CRM (para quem criou, o responsável e o vendedor da empresa). */
export interface CrmTaskAlert {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  company_id: string | null;
  company_name: string | null;
  assignee_name: string | null;
  created_by_name: string | null;
}

/** Mensagem pronta do WhatsApp: "/shortcut" no campo de mensagem puxa o texto (body). */
export interface CrmQuickReply {
  id: string;
  shortcut: string;
  body: string;
  updated_at: string;
  /** "all" = toda a equipe; "users" = quem criou e os subusuários escolhidos */
  visibility: 'all' | 'users';
  created_by: string | null;
  created_by_name: string | null;
  /** Subusuários escolhidos (quando "users") */
  users: { id: string; name: string }[];
  /** Pode usar com "/" no campo de mensagem */
  can_use: boolean;
  /** Pode editar/excluir (quem criou, dono ou admin) */
  can_edit: boolean;
}

export type CrmQuickReplyInput = { shortcut: string; body: string; visibility: 'all' | 'users'; user_ids: string[] };

export interface CrmLabel {
  id: string;
  name: string;
  color: string;
  /** Quantas conversas têm a etiqueta (só na lista de etiquetas) */
  conversations?: number;
}

export interface CrmConversation {
  id: string;
  phone: string;
  push_name: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  unread: number;
  last_message: string | null;
  last_message_at: string | null;
  contact_name: string | null;
  company_name?: string | null;
  labels?: CrmLabel[];
  /** Busca: a mensagem mais recente que contém o termo */
  matched?: { id: string; body: string; created_at: string } | null;
}

export interface CrmMessage {
  id: string;
  direction: 'in' | 'out';
  type: string;
  body: string | null;
  status: string;
  created_at: string;
  sent_by_name: string | null;
  /** Reação do número central e a do cliente (uma por pessoa, como no WhatsApp) */
  my_reaction: string | null;
  their_reaction: string | null;
  can_react: boolean;
  media_mime: string | null;
  file_name: string | null;
  /** Apagada para todos (por vocês ou pelo cliente) */
  revoked: boolean;
  /** Dá para apagar para todos (enviada por vocês, há menos de ~2 dias) */
  can_revoke: boolean;
  /** Quando o texto foi editado (por vocês, pelo celular ou pelo cliente) */
  edited_at: string | null;
  /** Dá para editar (texto enviado por vocês há menos de 15 minutos) */
  can_edit: boolean;
}

export interface CrmCompanyDetail {
  company: {
    id: string;
    name: string;
    legal_name: string | null;
    segment: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    number: string | null;
    neighborhood: string | null;
    phone: string | null;
    mobile: string | null;
    whatsapp: string | null;
    email: string | null;
    website: string | null;
    instagram: string | null;
    seller_names: string | null;
    lp_slug: string | null;
  };
  contacts: CrmContact[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  conversations: CrmConversation[];
  notes: { id: string; author_name: string; note: string; created_at: string }[];
}

export interface CrmWhatsAppStatus {
  configured: boolean;
  api_url: string | null;
  instance: string | null;
  state: string;
  error: string | null;
  /** A Evolution foi ajustada para GIF de verdade (gifPlayback) */
  gif_playback?: boolean;
}
