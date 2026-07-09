import { defineConfig } from '@playwright/test';

/** API routing tests — runs against real dev server, tests auth middleware behavior */
export default defineConfig({
  testDir: './e2e/api',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
  webServer: {
    command: 'pnpm --filter @steady-state/web dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
