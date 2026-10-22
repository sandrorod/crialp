-- ════════════════════════════════════════════════════════════════
-- CRM: apagar mensagens do WhatsApp
-- hidden_at: "apagar para mim" (some do CRM; a sincronização não traz de volta)
-- revoked_at: apagada para todos (por nós pelo CRM/celular, ou pelo cliente)
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_messages add column if not exists hidden_at timestamptz;
alter table lp_crm_messages add column if not exists revoked_at timestamptz;
