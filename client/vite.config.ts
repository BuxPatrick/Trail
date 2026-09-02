import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Mirrors the production rewrite, so dev and prod behave identically.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
