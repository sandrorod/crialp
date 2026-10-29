import { expect, test } from '@playwright/test';
import { openMenuIfCollapsed, SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('DentMap e Doctoralia estão no menu, cada um com a sua tela', async ({ page }) => {
  await page.goto('/admin/');
  await openMenuIfCollapsed(page);
  await page.getByRole('link', { name: 'Doctoralia' }).click();
  await expect(page.getByRole('heading', { name: 'Doctoralia' })).toBeVisible();
  await expect(page.getByPlaceholder('https://www.doctoralia.com.br/dentista/sao-paulo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar à lista' })).toBeVisible();
  await openMenuIfCollapsed(page);
  await page.getByRole('link', { name: 'DentMap' }).click();
  await expect(page.getByRole('heading', { name: 'DentMap' })).toBeVisible();
  await expect(page.getByPlaceholder('https://dentmap.com.br/dentistas/sao-paulo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar à lista' })).toBeVisible();
});
