import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  // Both servers must already be running. Starting them here would need the
  // test database, and this suite deliberately runs against mira_dev.
  webServer: undefined,
})
