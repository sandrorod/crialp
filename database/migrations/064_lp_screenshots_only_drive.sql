-- Os prints das LPs passam a ficar só no Google Drive: apaga todas as imagens guardadas no banco.
-- (as linhas continuam, com tamanho, data e o id do arquivo no Drive)
update lp_screenshots set image = null where image is not null;
