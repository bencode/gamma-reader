import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    port: 5302,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.GAMMA_BACKEND ?? 'http://127.0.0.1:3302',
        changeOrigin: true,
      },
    },
  },
})
