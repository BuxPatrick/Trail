import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Source, not dist: HMR should pick up schema edits immediately.
      '@trail/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Mirrors the production rewrite, so dev and prod behave identically.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
