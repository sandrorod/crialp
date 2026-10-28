import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('aba Relatório do CRM mostra as mensagens enviadas por vendedor e por dia', async ({ page }) => {
  await page.goto('/admin/crm');
  await page.getByRole('link', { name: 'Relatório' }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/relatorio$/);
  await expect(page.getByText('Mensagens enviadas por vendedor, por dia')).toBeVisible();
  await page.getByLabel('Período').selectOption('30');
  // Banco de teste tem mensagens enviadas recentes: a tabela aparece com a linha de total
  await expect(page.locator('tfoot').getByText('Total', { exact: true })).toBeVisible();
  await expect(page.locator('thead').getByText('Dia', { exact: true })).toBeVisible();
});
