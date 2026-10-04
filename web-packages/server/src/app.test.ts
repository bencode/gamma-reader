import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { createQuotaGuard } from './quota/guard.js'
import { openQuotaStore } from './quota/store.js'
import { readSourceConfig } from './source-config.js'

const guard = createQuotaGuard(
  openQuotaStore(':memory:'),
  {
    databaseFile: ':memory:',
    dailyTokens: 1,
    totalDailyTokens: 1,
    maximumConcurrent: 1,
    trustProxy: false,
  },
  () => '127.0.0.1',
)
const build = (webRoot?: string) => createApp(guard, webRoot)

describe('application HTTP boundaries', () => {
  let webRoot: string
  const page = '<!doctype html><html lang="en"><body>Gamma Reader</body></html>'
  const script = 'document.title = "Gamma Reader"'

  beforeAll(async () => {
    webRoot = await mkdtemp(join(tmpdir(), 'gamma-reader-web-'))
    await mkdir(join(webRoot, 'assets'))
    await writeFile(join(webRoot, 'index.html'), page)
    await writeFile(join(webRoot, 'assets', 'app.js'), script)
  })

  afterAll(async () => {
    if (webRoot) await rm(webRoot, { recursive: true, force: true })
  })

  it('provides health without frontend assets or external configuration', async () => {
    const response = await build().request('/api/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ status: 'ok', service: 'gamma-reader' })
  })

  it.each(['/api', '/api/unknown', '/api/health/unknown'])(
    'returns a JSON 404 for %s even with frontend assets',
    async path => {
      const response = await build(webRoot).request(path)

      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual({ error: 'Not found' })
    },
  )

  it('serves the built entry page and its JavaScript', async () => {
    const app = build(webRoot)
    const response = await app.request('/')
    const asset = await app.request('/assets/app.js')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toBe(page)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toMatch(/javascript/)
    expect(await asset.text()).toBe(script)
  })

  it.each([
    '/files',
    '/files/getting-started',
    '/files/reading-notes',
    '/p/bird-notes',
    '/p/bird-notes/files',
    '/p/bird-notes/files/reading-notes',
    '/files/sicm-lab/01-1.4-computing-actions.lab.md',
    '/p/bird-notes/files/sicm-lab/01-1.4-computing-actions.lab.md',
    '/pages/RAG',
    '/p/bird-notes/pages/RAG',
  ])('serves the application entry for direct navigation to %s', async path => {
    const response = await build(webRoot).request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toBe(page)
  })

  it.each(['/assets/missing.js', '/missing-page', '/p/bird-notes/missing-page'])(
    'returns 404 instead of the welcome page for %s',
    async path => {
      const response = await build(webRoot).request(path, {
        headers: { Accept: 'text/html' },
      })

      expect(response.status).toBe(404)
      expect(await response.text()).not.toBe(page)
    },
  )

  it('names the source a deployment syncs from, and has none by default', async () => {
    expect((await build().request('/api/source')).status).toBe(404)
    const config = readSourceConfig({
      GAMMA_SOURCE_NAME: 'brain2',
      GAMMA_SOURCE_URL: '/source/brain2',
    })
    if (!config) throw new Error('A source was configured')
    const response = await createApp(guard, undefined, undefined, { config, files: null }).request(
      '/api/source',
    )
    expect(await response.json()).toEqual({ name: 'brain2', url: '/source/brain2' })
    expect((await build().request('/api/library')).status).toBe(404)
    expect(() => readSourceConfig({ GAMMA_SOURCE_NAME: 'brain2' })).toThrow()
    expect(() =>
      readSourceConfig({
        GAMMA_SOURCE_NAME: 'brain2',
        GAMMA_SOURCE_URL: '/source/brain2',
        GAMMA_SOURCE_WORKTREE: '/notes',
      }),
    ).toThrow()
  })

  it('points the reader at a working tree it serves itself and takes changes back', async () => {
    const config = readSourceConfig({ GAMMA_SOURCE_NAME: 'notes', GAMMA_SOURCE_WORKTREE: '/notes' })
    if (!config) throw new Error('A source was configured')
    const files = {
      listing: async () => ({ version: '1', files: [{ path: 'a.md', version: '1', size: 3 }] }),
      blob: async () => null,
    }
    const app = createApp(guard, undefined, undefined, { config, files })

    expect(await (await app.request('/api/source')).json()).toEqual({
      name: 'notes',
      url: '/api/library',
      writable: true,
      id: expect.stringMatching(/^[0-9a-f]{40}$/),
    })
    expect(await (await app.request('/api/library')).json()).toEqual(await files.listing())
  })
})
