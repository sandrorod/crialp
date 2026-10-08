-- prospeccao passa de boolean para texto (valores atuais viram 'true' / 'false')
alter table companies alter column prospeccao drop default;
alter table companies alter column prospeccao type text using prospeccao::text;
alter table companies alter column prospeccao set default 'false';
