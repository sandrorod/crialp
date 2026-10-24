import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.cliente });

test('cliente vê só o próprio site e não acessa as telas da equipe', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.getByText('Padaria A').first()).toBeVisible();
  await expect(page.getByText('Oficina A')).toHaveCount(0);
  await page.goto('/admin/empresas');
  await expect(page.getByText('Oficina A')).toHaveCount(0);
});
