export interface CrmUser {
  id: string;
  name: string;
  role: string;
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
}
