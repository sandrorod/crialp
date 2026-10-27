import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('criar empresa com telefone já cadastrado avisa qual é a empresa e permite abrir a existente', async ({ page }) => {
  await page.goto('/admin/nova');
  await page.getByRole('button', { name: 'Preencher manualmente' }).click();
  await page.getByLabel('Nome *').fill('Nome Diferente Ltda');
  // Mesmo telefone da "Padaria A" do banco de teste, escrito de outro jeito
  await page.getByLabel('Telefone').first().fill('+55 11 3333-4444');
  await page.getByRole('button', { name: 'CONFIRMAR E GERAR LANDING PAGE' }).click();
  const dialog = page.getByRole('dialog', { name: 'Empresa possivelmente já cadastrada' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('mesmo telefone')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Abrir empresa existente' })).toHaveAttribute('href', /\/admin\/empresas\/[0-9a-f-]{36}$/);
  await expect(dialog.getByRole('button', { name: 'Criar mesmo assim' })).toBeVisible();
});
