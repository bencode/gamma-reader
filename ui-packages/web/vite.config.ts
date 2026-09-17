import { createRequire } from 'node:module'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'))
const pdfWasmDirectory = normalizePath(path.join(pdfjsDistPath, 'wasm'))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: `${pdfWasmDirectory}/*`,
          dest: 'wasm',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  optimizeDeps: {
    include: ['@gamma-reader/code-lab > biwascheme', '@gamma-reader/code-lab > sucrase'],
  },
  worker: {
    format: 'es',
  },
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
