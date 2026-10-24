import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test('lista só as Landing Pages da própria organização', async ({ page }) => {
  await page.goto('/admin/landing-pages');
  await expect(page.getByRole('row', { name: /Padaria A/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Oficina A/ })).toBeVisible();
  // "Loja B" é de outra organização
  await expect(page.getByText('Loja B')).toHaveCount(0);
});

test('empresas da organização aparecem no cadastro', async ({ page }) => {
  await page.goto('/admin/empresas');
  await expect(page.getByRole('row', { name: /Padaria A/ })).toBeVisible();
  await expect(page.getByText('Loja B')).toHaveCount(0);
});

test('editor abre com a prévia da página', async ({ page }) => {
  await page.goto('/admin/landing-pages');
  await page
    .getByRole('row', { name: /Padaria A/ })
    .getByTitle('Editar')
    .click();
  await expect(page).toHaveURL(/\/admin\/landing-pages\/[0-9a-f-]+/);
  const preview = page.frameLocator('iframe').first();
  await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Atendimento de qualidade');
});

test('desativar tira a página do ar e ativar devolve', async ({ page, request }) => {
  await page.goto('/admin/landing-pages');
  const row = page.getByRole('row', { name: /Oficina A/ });
  const toggle = row.getByRole('switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await request.get('/lp/oficina-a')).status()).toBe(200);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const off = await request.get('/lp/oficina-a');
  expect(off.status()).toBe(404);
  expect(await off.text()).toContain('Esta página não está disponível.');

  // Ao ativar o servidor gera o print da página (abre um navegador) antes de responder
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 });
  expect((await request.get('/lp/oficina-a')).status()).toBe(200);
});
