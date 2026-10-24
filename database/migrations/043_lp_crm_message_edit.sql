-- ════════════════════════════════════════════════════════════════
-- CRM: mensagens editadas no WhatsApp (pelo CRM, pelo celular do número central ou pelo cliente)
-- edited_at: quando o texto foi trocado (a mensagem mostra "editada")
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_messages add column if not exists edited_at timestamptz;
