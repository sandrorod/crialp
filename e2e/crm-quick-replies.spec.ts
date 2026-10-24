import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('mensagem pronta: cadastra com nome e texto e "/nome" puxa o texto no WhatsApp', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/crm\/(messages|send)/.test(r.url())) sent.push(r.url());
  });
  await page.goto('/admin/crm/whatsapp');
  await page.getByText('Cliente Teste').first().click();
  const field = page.getByPlaceholder(/Digite uma mensagem/);
  await expect(field).toBeVisible();

  // Cadastro: nome (atalho) e texto
  const texto = 'O plano custa R$ 99,90 por mês.\nPosso te mandar o link?';
  await page.getByRole('button', { name: 'Mensagens prontas' }).click();
  const modal = page.getByRole('dialog', { name: 'Mensagens prontas' });
  await modal.getByRole('button', { name: 'Nova mensagem pronta' }).click();
  await modal.getByLabel('Nome (atalho)').fill('Valor');
  await modal.getByPlaceholder('Texto completo que vai para o campo de mensagem').fill(texto);
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByText('/valor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // Uso: "/va" mostra a sugestão e Enter troca pelo texto (sem enviar)
  await field.fill('Bom dia! /va');
  await expect(page.getByRole('option', { name: /\/valor/ })).toBeVisible();
  await field.press('Enter');
  await expect(field).toHaveValue(`Bom dia! ${texto}`);
  await expect(page.getByRole('listbox', { name: 'Mensagens prontas' })).toHaveCount(0);
  expect(sent).toEqual([]);
});

test('"/nome" que não existe oferece criar a mensagem', async ({ page }) => {
  await page.goto('/admin/crm/whatsapp');
  await page.getByText('Cliente Teste').first().click();
  const field = page.getByPlaceholder(/Digite uma mensagem/);
  await field.fill('/pix');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar /pix' }).click();
  await expect(page.getByRole('dialog', { name: 'Mensagens prontas' }).getByLabel('Nome (atalho)')).toHaveValue('pix');
});
