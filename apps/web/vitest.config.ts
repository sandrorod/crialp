import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Datas formatadas como no Brasil, em qualquer máquina (CI roda em UTC)
process.env.TZ = 'America/Sao_Paulo';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', reporter: ['text-summary', 'lcov'], include: ['src/**/*.{ts,tsx}'], exclude: ['src/**/*.test.*', 'src/main.tsx'] },
  },
});
