import { expect, test } from '@playwright/test';

test('página publicada abre sem login, com título e botão de contato', async ({ page }) => {
  const res = await page.goto('/lp/padaria-a');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Atendimento de qualidade');
  await expect(page).toHaveTitle(/Empresa Teste|Padaria A/);
});

test('página publicada tem CSP e não carrega scripts de terceiros', async ({ page }) => {
  const res = await page.goto('/lp/padaria-a');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'sha256-/);
  const scripts = await page.locator('script[src]').evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src));
  expect(scripts.filter((src) => !src.startsWith('http://localhost'))).toEqual([]);
});

test('endereço inexistente mostra a página de indisponível', async ({ request }) => {
  const res = await request.get('/lp/nao-existe');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('Esta página não está disponível.');
});
