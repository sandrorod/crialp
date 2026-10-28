import { expect, test, type Page } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

const BASE = 'https://dentmap.com.br/dentistas/campinas';
const P = (n: number) => (n === 1 ? BASE : `${BASE}?pagina=${n}`);
const lp = { id: '00000000-0000-4000-8000-000000000001', slug: 'x', status: 'ativa' };
const existing = (withLp: boolean) => ({ id: '00000000-0000-4000-8000-0000000000aa', name: 'Já cadastrada', reason: 'link', landing_page: withLp ? lp : null });

/** Respostas do DentMap simuladas (a página 1 tem um dentista sem LP, um cadastrado sem LP e um com LP; as outras, só com LP). */
async function mockDentmap(page: Page) {
  await page.route('**/api/dentmap-pages?*', (r) => r.fulfill({ json: { pages: [P(1), P(2), P(3)] } }));
  await page.route('**/api/dentmap-links?*', (r) => {
    const url = new URL(r.request().url()).searchParams.get('url');
    const items =
      url === P(1)
        ? [
            { url: `${BASE}/novo-aaaaaaaa`, name: 'Dentista Novo', existing: null },
            { url: `${BASE}/cadastrado-bbbbbbbb`, name: 'Cadastrado sem LP', existing: existing(false) },
            { url: `${BASE}/com-lp-cccccccc`, name: 'Com LP', existing: existing(true) },
          ]
        : [{ url: `${BASE}/com-lp-dddddddd`, name: 'Com LP 2', existing: existing(true) }];
    return r.fulfill({ json: { items } });
  });
}

test('DentMap: adicionar link põe todas as páginas na lista; Iniciar gera só quem não tem LP', async ({ page }) => {
  await mockDentmap(page);
  await page.goto('/admin/dentmap');
  await page.evaluate(() => localStorage.removeItem('lp:dentmap-links'));
  await page.reload();
  await page.getByPlaceholder('https://dentmap.com.br/dentistas/sao-paulo').fill(BASE);
  await page.getByRole('button', { name: 'Adicionar à lista' }).click();
  await expect(page.getByText('3 página(s) adicionada(s) à lista')).toBeVisible();
  const select = page.getByLabel('Link da lista');
  await expect(select.locator('option')).toHaveText(['campinas — página 1', 'campinas — página 2', 'campinas — página 3']);
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await expect(page).toHaveURL(/\/admin\/nova\?lote=1/);
  const batch = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lp:batch') ?? 'null'));
  // Sem o que já tem LP; o cadastrado sem LP vai com o id da empresa (gera direto)
  expect(batch.items.map((i: { name: string; companyId?: string }) => [i.name, i.companyId ?? null])).toEqual([
    ['Dentista Novo', null],
    ['Cadastrado sem LP', '00000000-0000-4000-8000-0000000000aa'],
  ]);
  expect(batch.back).toBe(`/dentmap?concluido=${encodeURIComponent(P(1))}&fotos=1`);
});

test('DentMap: no fim do lote o link sai da lista; no Automático segue para o próximo', async ({ page }) => {
  await mockDentmap(page);
  await page.goto('/admin/dentmap');
  await page.evaluate((links) => localStorage.setItem('lp:dentmap-links', JSON.stringify(links)), [P(1), P(2), P(3)]);
  // Volta de um lote automático da página 1: ela sai; a 2 e a 3 só têm dentistas com LP, então saem em seguida
  await page.goto(`/admin/dentmap?concluido=${encodeURIComponent(P(1))}&fotos=1&auto=1`);
  await expect(page.getByText('Automático: começando campinas — página 2.')).toBeVisible();
  await expect(page.getByLabel('Link da lista').locator('option')).toHaveText(['Lista vazia: adicione um link acima']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lp:dentmap-links') ?? '[]'))).toEqual([]);
  await expect(page).toHaveURL(/\/admin\/dentmap$/);
});
