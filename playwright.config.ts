import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

/**
 * Testes end-to-end (npm run test:e2e): o painel compilado e a API rodando juntos sobre um banco de teste
 * zerado (apps/api/test/e2e-server.ts). Precisa do Postgres de teste na porta 54399 (ver SECURITY.md).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Localmente usa o Chrome instalado; no CI, o Chromium do Playwright
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...(process.env.CI ? {} : { channel: 'chrome' }) } },
    { name: 'chromium', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], ...(process.env.CI ? {} : { channel: 'chrome' }) } },
    { name: 'celular', dependencies: ['setup'], use: { ...devices['Pixel 7'], ...(process.env.CI ? {} : { channel: 'chrome' }) } },
  ],
  webServer: {
    command: 'npm run build --workspace apps/web && npm run e2e:server --workspace apps/api',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
  },
});
