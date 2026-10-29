import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('Configurações: cadastrar e alterar a credencial do Google Drive', async ({ page }, info) => {
  const id = `${info.project.name}-1234.apps.googleusercontent.com`;
  await page.goto('/admin/configuracoes');
  await page
    .getByRole('button', { name: /Google Drive/ })
    .first()
    .click();
  await expect(page.getByText('Credencial do Google', { exact: true })).toBeVisible();
  // Já cadastrada (outro teste/projeto): abre o formulário pelo "Alterar credencial"
  const change = page.getByRole('button', { name: 'Alterar credencial' });
  if (await change.isVisible()) await change.click();
  await page.getByLabel('ID do cliente').fill('qualquer');
  await page.getByLabel('Chave secreta do cliente').fill('GOCSPX-teste-e2e-9876');
  await page.getByRole('button', { name: 'Salvar credencial' }).click();
  await expect(page.getByText(/ID do cliente inválido/)).toBeVisible();
  await page.getByLabel('ID do cliente').fill(id);
  await page.getByRole('button', { name: 'Salvar credencial' }).click();
  await expect(page.getByText(id)).toBeVisible();
  await expect(page.getByText(/•••• 9876 · cadastrada aqui/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Conectar Google Drive/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alterar credencial' })).toBeVisible();
});
