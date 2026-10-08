import { execFileSync } from 'node:child_process'
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

// The release is the root package's version; the commit is passed in by a deployment, whose image
// has no .git, or read from the checkout when building locally.
const { version } = require('../../package.json') as { version: string }
const commitOf = () => {
  if (process.env.GAMMA_READER_COMMIT) return process.env.GAMMA_READER_COMMIT
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch (error) {
    console.warn('Building without a commit in the version', error)
    return ''
  }
}
const commit = commitOf()

// Driving the whole Workbench costs about a second per test. Those files form their own project
// so an edit-and-run loop stays quick; `pnpm check` runs both projects before anything ships.
const integrationTests = ['**/*.integration.test.?(c|m)[jt]s?(x)']
const evalBackend = process.env.GAMMA_EVAL_BACKEND ?? 'http://127.0.0.1:3402'
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
  define: { __APP_VERSION__: JSON.stringify(commit ? `${version} (${commit})` : version) },
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
      // Evaluations ask a real model through a running backend, so they cost tokens and vary run to
      // run; they are run by hand with `pnpm eval:memory`, never by `pnpm check`.
      {
        extends: true,
        test: {
          ...testDefaults,
          name: 'eval',
          include: ['**/*.eval.ts'],
          setupFiles: ['./src/test/eval-setup.ts'],
          environmentOptions: { jsdom: { url: evalBackend } },
          testTimeout: 30 * 60 * 1000,
          fileParallelism: false,
        },
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
