import { expect, type Page } from '@playwright/test';

/** Senha dos usuários criados pelo seed() de apps/api/test/helpers.ts */
export const PASSWORD = 'senha-de-teste-123';

/** Sessões gravadas pelo auth.setup.ts */
export const SESSION = { dono: 'e2e/.auth/dono.json', cliente: 'e2e/.auth/cliente.json' };

export async function login(page: Page, email: string) {
  await page.goto('/admin/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Em telas estreitas o menu (com "Sair") fica recolhido atrás do botão "Abrir menu". */
export async function openMenuIfCollapsed(page: Page) {
  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  if (await toggle.isVisible()) await toggle.click();
}
