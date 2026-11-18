import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Backend for `npm run dev`. Override with API_PROXY_TARGET if it runs elsewhere.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Windows drives mounted in WSL (/mnt/c, /mnt/d) do not emit file-change events.
    watch: { usePolling: process.cwd().startsWith('/mnt/') },
    proxy: {
      // The app always calls relative /api paths; in production the Ingress
      // (or nginx in Docker Compose) routes them to the backend.
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
