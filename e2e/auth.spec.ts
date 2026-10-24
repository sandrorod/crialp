import { expect, test } from '@playwright/test';
import { login, openMenuIfCollapsed, PASSWORD } from './helpers';

// Estes testes fazem o próprio login
test.use({ storageState: { cookies: [], origins: [] } });

test('senha errada mostra o erro e continua na tela de login', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('E-mail').fill('dono-a@teste.dev');
  await page.getByLabel('Senha').fill(`${PASSWORD}-errada`);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/e-mail ou senha/i)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('login leva ao Dashboard e "Sair" encerra a sessão', async ({ page }) => {
  await login(page, 'dono-a@teste.dev');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await openMenuIfCollapsed(page);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  // Sessão encerrada: voltar para o painel pede login de novo
  await page.goto('/admin/landing-pages');
  await expect(page).toHaveURL(/\/admin\/login/);
});

test('painel sem login redireciona para o login', async ({ page }) => {
  await page.goto('/admin/empresas');
  await expect(page).toHaveURL(/\/admin\/login/);
});
