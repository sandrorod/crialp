import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('botão direito na conversa da lista marca como não lida', async ({ page }) => {
  await page.goto('/admin/crm/whatsapp');
  const item = page.getByRole('listitem').filter({ hasText: 'Cliente Teste' }).first();
  await item.getByRole('button').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Marcar como não lida' }).click();
  await expect(page.getByRole('menuitem', { name: 'Marcar como não lida' })).toHaveCount(0);
  await expect(item.getByText('1', { exact: true })).toBeVisible();
  // Continua não lida depois de recarregar (gravado no servidor)
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'Cliente Teste' }).first().getByText('1', { exact: true })).toBeVisible();
});
