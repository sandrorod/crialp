-- Cópia da imagem da LP no Google Drive (pasta "lp")
alter table lp_screenshots add column if not exists drive_file_id text;
alter table lp_screenshots add column if not exists drive_error text;
