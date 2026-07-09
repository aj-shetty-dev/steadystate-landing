import { defineConfig } from '@playwright/test';

/** Browser workflow tests — uses E2E_TEST_MODE to bypass Clerk auth */
export default defineConfig({
  testDir: './e2e/browser',
  timeout: 30000,
  retries: 0,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'E2E_TEST_MODE=true pnpm --filter @steady-state/web dev',
    url: 'http://localhost:3000/members',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
