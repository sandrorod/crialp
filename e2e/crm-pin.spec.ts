import { expect, test } from '@playwright/test';
import { SESSION } from './helpers';

test.use({ storageState: SESSION.dono });

const conv = (id: string, name: string, minutesAgo: number, pinned = false) => ({
  id,
  phone: `55119${id.slice(-8)}`,
  push_name: name,
  unread: 0,
  last_message: `Oi de ${name}`,
  last_message_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  contact_name: name,
  company_id: 'x',
  pinned,
});

test('botão direito: fixar no topo e desafixar', async ({ page }) => {
  const A = '00000000-0000-4000-8000-000000000a01';
  const B = '00000000-0000-4000-8000-000000000b02';
  let pinned = false;
  const calls: string[] = [];
  await page.route('**/api/crm/sync', (r) => r.fulfill({ json: { added: 0 } }));
  await page.route(/\/api\/crm\/conversations(\?.*)?$/, (r) =>
    r.fulfill({ json: pinned ? [conv(B, 'Bruna Antiga', 90, true), conv(A, 'Ana Recente', 1)] : [conv(A, 'Ana Recente', 1), conv(B, 'Bruna Antiga', 90)] }),
  );
  await page.route(`**/api/crm/conversations/${B}/pin`, (r) => {
    calls.push(r.request().method());
    pinned = r.request().method() === 'POST';
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin/crm/whatsapp');
  const names = page.getByRole('listitem').locator('span.truncate');
  await expect(names.filter({ hasText: /^(Ana Recente|Bruna Antiga)$/ })).toHaveText(['Ana Recente', 'Bruna Antiga']);

  await page.getByRole('listitem').filter({ hasText: 'Bruna Antiga' }).getByRole('button').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Fixar no topo' }).click();
  await expect(names.filter({ hasText: /^(Ana Recente|Bruna Antiga)$/ })).toHaveText(['Bruna Antiga', 'Ana Recente']);
  await expect(page.getByRole('listitem').filter({ hasText: 'Bruna Antiga' }).getByLabel('Fixada no topo')).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: 'Bruna Antiga' }).getByRole('button').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Desafixar' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Bruna Antiga' }).getByLabel('Fixada no topo')).toHaveCount(0);
  expect(calls).toEqual(['POST', 'DELETE']);
});
