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

test('DentMap: na lista de dentistas, Abrir LP e Ver empresa abrem em nova aba', async ({ page }) => {
  await mockDentmap(page);
  await page.goto('/admin/dentmap');
  await page.evaluate((links) => localStorage.setItem('lp:dentmap-links', JSON.stringify(links)), [P(1)]);
  await page.reload();
  await page.getByText('Ver dentistas deste link').click();
  const comLp = page.locator('div.flex-wrap').filter({ hasText: 'Com LP' });
  await expect(comLp.getByRole('link', { name: 'Abrir LP' })).toHaveAttribute('target', '_blank');
  await expect(comLp.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('target', '_blank');
  await expect(comLp.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('href', /\/admin\/empresas\/00000000-0000-4000-8000-0000000000aa$/);
  const semLp = page.locator('div.flex-wrap').filter({ hasText: 'Cadastrado sem LP' });
  await expect(semLp.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('target', '_blank');
});

test('DentMap: com "Listar antes de gerar", o Iniciar só lista para escolher; o lote escolhido tira o link da fila', async ({ page }) => {
  await mockDentmap(page);
  await page.goto('/admin/dentmap');
  await page.evaluate(
    (links) => {
      localStorage.setItem('lp:dentmap-links', JSON.stringify(links));
      localStorage.removeItem('lp:dentmap-listar');
    },
    [P(1), P(2)],
  );
  await page.reload();
  await page.getByLabel('Listar antes de gerar').check();
  await expect(page.getByRole('button', { name: 'Automático' })).toBeDisabled();
  await page.getByRole('button', { name: 'Iniciar' }).click();
  // Nada começa sozinho: fica na tela, com os dentistas listados para escolher
  await expect(page.getByText('3 dentista(s) encontrado(s)')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/dentmap$/);
  await page.getByRole('button', { name: 'Gerar 1 LP' }).click();
  await expect(page).toHaveURL(/\/admin\/nova\?lote=1/);
  const batch = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lp:batch') ?? 'null'));
  expect(batch.items.map((i: { name: string }) => i.name)).toEqual(['Dentista Novo']);
  expect(batch.back).toBe(`/dentmap?concluido=${encodeURIComponent(P(1))}&fotos=1`);
  // A opção fica lembrada
  await page.goto('/admin/dentmap');
  await expect(page.getByLabel('Listar antes de gerar')).toBeChecked();
});

test('Doctoralia: mesma fila de links (?page=N), Iniciar e Automático', async ({ page }) => {
  const DBASE = 'https://www.doctoralia.com.br/dentista/campinas';
  const DP = (n: number) => (n === 1 ? DBASE : `${DBASE}?page=${n}`);
  await page.route('**/api/doctoralia-pages?*', (r) => r.fulfill({ json: { pages: [DP(1), DP(2)] } }));
  await page.route('**/api/doctoralia-links?*', (r) =>
    r.fulfill({
      json: {
        items: [
          { url: 'https://www.doctoralia.com.br/marcia-ferraz/dentista/campinas', name: 'Dra. Marcia', existing: null },
          { url: 'https://www.doctoralia.com.br/clinicas/com-lp', name: 'Clínica com LP', existing: existing(true) },
        ],
      },
    }),
  );
  await page.goto('/admin/doctoralia');
  await page.evaluate(() => localStorage.removeItem('lp:doctoralia-links'));
  await page.reload();
  await page.getByPlaceholder('https://www.doctoralia.com.br/dentista/sao-paulo').fill(DBASE);
  await page.getByRole('button', { name: 'Adicionar à lista' }).click();
  await expect(page.getByLabel('Link da lista').locator('option')).toHaveText(['campinas — página 1', 'campinas — página 2']);
  await expect(page.getByRole('button', { name: 'Automático' })).toBeEnabled();
  await page.getByRole('button', { name: 'Automático' }).click();
  await expect(page).toHaveURL(/\/admin\/nova\?lote=1/);
  const batch = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lp:batch') ?? 'null'));
  expect(batch.items.map((i: { name: string }) => i.name)).toEqual(['Dra. Marcia']);
  expect(batch.back).toBe(`/doctoralia?concluido=${encodeURIComponent(DP(1))}&fotos=1&auto=1`);
});
