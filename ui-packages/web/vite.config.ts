import { createRequire } from 'node:module'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { configDefaults, defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'))
const pdfWasmDirectory = normalizePath(path.join(pdfjsDistPath, 'wasm'))

// Driving the whole Workbench costs about a second per test. Those files form their own project
// so an edit-and-run loop stays quick; `pnpm check` runs both projects before anything ships.
const integrationTests = ['**/*.integration.test.?(c|m)[jt]s?(x)']
const testDefaults = {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  testTimeout: 15000,
  // The app gets Mammoth's browser build through the legacy `browser` field, which Node
  // resolution ignores in favour of a zip reader that will not take an ArrayBuffer. Point the
  // tests at the build the app ships so a Word document is read here by the real library.
  alias: { mammoth: 'mammoth/mammoth.browser.js' },
}

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
  // Vite treats .pdf as an asset already; the Office formats among the starter files are not
  // in its default list, so an import of one would otherwise be parsed as JavaScript.
  assetsInclude: ['**/*.docx', '**/*.xlsx'],
  optimizeDeps: {
    include: ['@gamma-reader/code-lab > biwascheme', '@gamma-reader/code-lab > sucrase'],
  },
  worker: {
    format: 'es',
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          ...testDefaults,
          name: 'unit',
          exclude: [...configDefaults.exclude, ...integrationTests],
        },
      },
      {
        extends: true,
        test: { ...testDefaults, name: 'integration', include: integrationTests },
      },
    ],
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
