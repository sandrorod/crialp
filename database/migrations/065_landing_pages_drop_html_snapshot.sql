-- O HTML pronto de cada LP (html_content) era gravado a cada edição mas nunca lido: a página é sempre
-- montada a partir dos dados. Ocupava ~100 MB no banco e vinha junto em toda consulta (egress do Supabase).
update landing_pages set html_content = null where html_content is not null;
