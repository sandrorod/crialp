import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/crm/whatsapp');
  await page.getByText('Cliente Teste').first().click();
});

test('mensagens prontas em cima e anexar embaixo', async ({ page }) => {
  const quick = await page.getByRole('button', { name: 'Mensagens prontas' }).boundingBox();
  const attach = await page.getByRole('button', { name: 'Anexar' }).boundingBox();
  expect(quick && attach).toBeTruthy();
  expect(quick!.y).toBeLessThan(attach!.y);
  expect(Math.abs(quick!.x - attach!.x)).toBeLessThan(2);
});

test('edita uma mensagem enviada e ela aparece como "editada"', async ({ page }, info) => {
  // Mesmo banco para computador e celular: cada projeto edita a mensagem para um texto próprio
  const bubble = page.locator('.group', { hasText: /Valor: R\$/ }).last();
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Mais opções da mensagem' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const box = page.getByRole('textbox', { name: 'Editar mensagem' });
  const before = await box.inputValue();
  expect(before).toMatch(/^Valor: R\$/);
  const after = `Valor: R$ 19,90 com frete (${info.project.name})`;
  await box.fill(after);
  await box.press('Enter');
  await expect(page.getByText('Mensagem editada.')).toBeVisible();
  const edited = page.locator('.group', { hasText: after }).last();
  await expect(edited.getByText('editada', { exact: false })).toBeVisible();
  await expect(page.getByText(before, { exact: true })).toHaveCount(0);
});

test('mensagem enviada há mais de 15 minutos não tem "Editar"', async ({ page }) => {
  const old = page.locator('.group', { hasText: 'Mensagem antiga' }).last();
  await old.hover();
  await old.getByRole('button', { name: 'Mais opções da mensagem' }).click();
  await expect(page.getByRole('button', { name: 'Apagar para mim' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
});
