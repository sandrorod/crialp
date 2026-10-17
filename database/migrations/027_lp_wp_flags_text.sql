-- ════════════════════════════════════════════════════════════════
-- wp_verificado e wp_testado passam a ser texto (opcional, sem valor padrão).
-- Os valores booleanos anteriores eram só o padrão (false), então ficam vazios.
-- ════════════════════════════════════════════════════════════════

alter table landing_pages
  alter column wp_verificado drop default,
  alter column wp_verificado drop not null,
  alter column wp_verificado type text using null,
  alter column wp_testado drop default,
  alter column wp_testado drop not null,
  alter column wp_testado type text using null;
