import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Every integration test file shares one mira_test database and each
    // resets it by truncating. Run files one at a time or they wipe each
    // other's rows mid-test - which passes file-by-file and fails together.
    fileParallelism: false,
  },
})
