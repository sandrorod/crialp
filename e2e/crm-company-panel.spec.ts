import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

// Larguras de tela de computador: no celular a lista e a conversa já ocupam a tela inteira
test.skip(({ isMobile }) => isMobile, 'só em telas de computador');

async function openChat(page: import('@playwright/test').Page) {
  await page.goto('/admin/crm/whatsapp');
  await page.getByText('Cliente Teste').first().click();
  await expect(page.getByPlaceholder(/Digite uma mensagem/)).toBeVisible();
}

test('tela larga: coluna da empresa ao lado da conversa, da largura da lista, sem apertar a conversa', async ({ page }) => {
  const chatBox = () => page.locator('section', { has: page.getByPlaceholder(/Digite uma mensagem/) }).boundingBox();
  // Largura da conversa no layout de 1280px (antes da coluna existir)
  await page.setViewportSize({ width: 1280, height: 900 });
  await openChat(page);
  const antes = await chatBox();

  await page.setViewportSize({ width: 1700, height: 900 });
  const column = page.getByRole('complementary', { name: 'Dados da empresa' });
  await expect(column).toBeVisible();
  await expect(column.getByRole('link', { name: 'Padaria A' })).toBeVisible();
  await expect(column.getByText('Negócios (0)')).toBeVisible();

  const list = await page.locator('aside').first().boundingBox();
  const panel = await column.boundingBox();
  const depois = await chatBox();
  expect(Math.round(panel!.width)).toBe(Math.round(list!.width));
  expect(Math.round(depois!.width)).toBeGreaterThanOrEqual(Math.round(antes!.width));
  // Sem o botão "Empresa" (a coluna já está à vista)
  await expect(page.getByRole('button', { name: 'Empresa', exact: true })).toBeHidden();
});

test('tela menor: sem coluna; o botão "Empresa" abre os dados por cima da conversa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openChat(page);
  await expect(page.getByRole('complementary', { name: 'Dados da empresa' })).toBeHidden();
  const before = await page.locator('section', { has: page.getByPlaceholder(/Digite uma mensagem/) }).boundingBox();
  await page.getByRole('button', { name: 'Empresa', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Padaria A' }).last()).toBeVisible();
  const after = await page.locator('section', { has: page.getByPlaceholder(/Digite uma mensagem/) }).boundingBox();
  expect(Math.round(after!.width)).toBe(Math.round(before!.width));
  await page.getByRole('button', { name: 'Fechar dados da empresa' }).click();
  await expect(page.getByRole('button', { name: 'Fechar dados da empresa' })).toHaveCount(0);
});
