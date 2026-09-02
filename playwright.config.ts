import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Point at the deployment with E2E_BASE_URL to smoke-test production.
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  // Both servers must already be running. Starting them here would need the
  // test database, and this suite deliberately runs against mira_dev.
  webServer: undefined,
})
