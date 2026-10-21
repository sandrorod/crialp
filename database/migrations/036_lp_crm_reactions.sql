-- ════════════════════════════════════════════════════════════════
-- CRM: reações nas mensagens do WhatsApp (como no app, uma por pessoa)
-- my_reaction: a do número central (enviada pelo CRM ou pelo celular); their_reaction: a do cliente
-- ════════════════════════════════════════════════════════════════

alter table lp_crm_messages add column if not exists my_reaction text;
alter table lp_crm_messages add column if not exists their_reaction text;
