-- Combinações de cores: cor de fundo da página (a 1ª das três cores do modelo)
alter table lp_color_palettes add column if not exists background_color text;
