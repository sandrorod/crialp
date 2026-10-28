import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('aba Relatório do CRM mostra enviadas e recebidas lado a lado, clientes contatados e mensagens por cliente', async ({ page }, info) => {
  await page.goto('/admin/crm');
  await page.getByRole('link', { name: 'Relatório' }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/relatorio$/);
  await page.getByLabel('Período').selectOption('30');
  for (const title of ['Mensagens enviadas e recebidas', 'Clientes contatados', 'Mensagens por cliente']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  // Banco de teste: a conversa da "Padaria A" tem mensagens recentes (o relatório mostra o nome da empresa)
  await expect(page.getByRole('cell', { name: /Padaria A/ }).first()).toBeVisible();
  if (info.project.name === 'chromium') await page.screenshot({ path: 'test-results/relatorio-30-dias.png', fullPage: true });
  // Anual: os meses nas linhas
  const year = new Date().getFullYear();
  await page.getByLabel('Período').selectOption(`year:${year}`);
  // Enviadas e recebidas lado a lado embaixo de cada vendedor
  await expect(page.locator('thead').first().getByText('Enviadas').first()).toBeVisible();
  await expect(page.locator('thead').first().getByText('Recebidas').first()).toBeVisible();
  await expect(
    page
      .locator('tbody td')
      .filter({ hasText: new RegExp(`janeiro de ${year}`) })
      .first(),
  ).toBeVisible();
});
