import { test as setup } from '@playwright/test';
import { login, SESSION } from './helpers';

// Uma sessão por usuário para todos os testes: o login tem limite de 10 por IP a cada 15 min
setup('sessão do dono', async ({ page }) => {
  await login(page, 'dono-a@teste.dev');
  await page.context().storageState({ path: SESSION.dono });
});

setup('sessão do cliente', async ({ page }) => {
  await login(page, 'cliente-a@teste.dev');
  await page.context().storageState({ path: SESSION.cliente });
});
