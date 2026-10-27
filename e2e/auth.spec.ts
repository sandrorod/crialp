import { expect, test } from '@playwright/test';
import { login, openMenuIfCollapsed, PASSWORD } from './helpers';

// Estes testes fazem o próprio login
test.use({ storageState: { cookies: [], origins: [] } });

test('senha errada mostra o erro e continua na tela de login', async ({ page }) => {
  await page.goto('/lps');
  await page.getByLabel('E-mail').fill('dono-a@teste.dev');
  await page.getByLabel('Senha').fill(`${PASSWORD}-errada`);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/e-mail ou senha/i)).toBeVisible();
  await expect(page).toHaveURL(/\/lps/);
});

test('login leva ao Dashboard e "Sair" encerra a sessão', async ({ page }) => {
  await login(page, 'dono-a@teste.dev');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await openMenuIfCollapsed(page);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/lps/);
  // Sessão encerrada: voltar para o painel pede login de novo
  await page.goto('/admin/landing-pages');
  await expect(page).toHaveURL(/\/lps/);
});

test('painel sem login redireciona para o login', async ({ page }) => {
  await page.goto('/admin/empresas');
  await expect(page).toHaveURL(/\/lps/);
});

test('página inicial fica no endereço, sem link para o login; o login abre em /lps', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Landing Pages profissionais para empresas' })).toBeVisible();
  await expect(page.getByRole('link')).toHaveCount(0);
  await page.goto('/lps');
  await expect(page.getByRole('heading', { name: 'Entrar no painel' })).toBeVisible();
});

test('login vindo de uma página do painel volta para ela', async ({ page }) => {
  await page.goto('/admin/empresas');
  await expect(page).toHaveURL(/\/lps\?from=%2Fempresas/);
  await page.getByLabel('E-mail').fill('dono-a@teste.dev');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin\/empresas/);
});
