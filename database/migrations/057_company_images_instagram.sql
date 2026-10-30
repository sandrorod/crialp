-- ════════════════════════════════════════════════════════════════
-- Fotos do Instagram da empresa (as 6 mais recentes, copiadas ao gerar a LP)
-- ════════════════════════════════════════════════════════════════

alter table company_images drop constraint if exists company_images_source_check;
alter table company_images add constraint company_images_source_check check (source in ('scraped', 'upload', 'manual', 'instagram'));
