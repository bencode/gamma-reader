import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@gamma-reader/code-lab > biwascheme', '@gamma-reader/code-lab > sucrase'],
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5303,
    strictPort: true,
  },
})
