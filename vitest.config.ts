import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // Tests always read shared from SOURCE, never from a stale dist build.
      '@trail/shared': fileURLToPath(new URL('./shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Every integration test file shares one trail_test database and each
    // resets it by truncating. Run files one at a time or they wipe each
    // other's rows mid-test - which passes file-by-file and fails together.
    fileParallelism: false,

    // e2e/ belongs to Playwright. Vitest cannot run Playwright's test() and
    // will fail trying, so the boundary is stated rather than left to the
    // default globs happening not to overlap.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})
