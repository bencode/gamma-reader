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
    expect(await (await build().request('/api/sources')).json()).toEqual([])
    const config = readSourceConfig({
      GAMMA_SOURCE_NAME: 'brain2',
      GAMMA_SOURCE_URL: '/source/brain2',
    })
    if (!config) throw new Error('A source was configured')
    const response = await createApp(guard, undefined, undefined, { config, served: [] }).request(
      '/api/sources',
    )
    expect(await response.json()).toEqual([{ name: 'brain2', url: '/source/brain2' }])
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
    const env = { GAMMA_SOURCE_NAME: 'notes', GAMMA_SOURCE_WORKTREE: '/notes' }
    const config = readSourceConfig({
      GAMMA_SOURCE_NAME: 'notes',
      GAMMA_SOURCE_WORKTREE: '/notes',
      GAMMA_SOURCE_EXCLUDE: 'meta, /tmp/',
    })
    if (!config) throw new Error('A source was configured')
    const files = {
      listing: async () => ({ version: '1', files: [{ path: 'a.md', version: '1', size: 3 }] }),
      blob: async () => null,
    }
    if (config.kind !== 'worktree') throw new Error('A working tree was configured')
    const served = config.projects.map(project => ({ project, files }))
    const app = createApp(guard, undefined, undefined, { config, served })

    expect(await (await app.request('/api/sources')).json()).toEqual([
      {
        name: 'notes',
        url: '/api/library',
        writable: true,
        id: expect.stringMatching(/^[0-9a-f]{40}$/),
        scope: { include: [], exclude: ['meta', 'tmp'] },
      },
    ])
    expect(() => readSourceConfig({ ...env, GAMMA_SOURCE_EXCLUDE: '../elsewhere' })).toThrow(
      'GAMMA_SOURCE_EXCLUDE folders must be named from the repository root',
    )
    expect(await (await app.request('/api/library')).json()).toEqual(await files.listing())
  })

  it('serves each folder named as a project of its own', async () => {
    const env = {
      GAMMA_SOURCE_WORKTREE: '/florence',
      GAMMA_SOURCE_PROJECTS: 'security, topics/学习',
    }
    const config = readSourceConfig({ ...env, GAMMA_SOURCE_NAME: 'florence' })
    if (config?.kind !== 'worktree') throw new Error('A working tree was configured')
    const listingOf = (path: string) => async () => ({
      version: path,
      files: [{ path, version: path, size: 1 }],
    })
    const served = config.projects.map(project => ({
      project,
      files: { listing: listingOf(`${project.name}.md`), blob: async () => null },
    }))
    const app = createApp(guard, undefined, undefined, { config, served })

    const sources = (await (await app.request('/api/sources')).json()) as {
      name: string
      url: string
      id: string
    }[]
    expect(sources.map(({ name, url }) => ({ name, url }))).toEqual([
      { name: 'security', url: '/api/library/security' },
      { name: '学习', url: '/api/library/topics/%E5%AD%A6%E4%B9%A0' },
    ])
    expect(new Set(sources.map(source => source.id)).size).toBe(2)
    expect(await (await app.request(sources[1]?.url ?? '')).json()).toEqual(
      await listingOf('学习.md')(),
    )
    expect((await app.request('/api/library')).status).toBe(404)

    expect(() =>
      readSourceConfig({ GAMMA_SOURCE_URL: '/source', GAMMA_SOURCE_PROJECTS: 'a' }),
    ).toThrow('GAMMA_SOURCE_PROJECTS needs GAMMA_SOURCE_WORKTREE or GAMMA_SOURCE_REPO')
    expect(() => readSourceConfig({ ...env, GAMMA_SOURCE_PROJECTS: 'a/math,b/Math' })).toThrow(
      'GAMMA_SOURCE_PROJECTS folders must end in different names',
    )
    expect(() => readSourceConfig({ ...env, GAMMA_SOURCE_PROJECTS: 'files/math' })).toThrow(
      'GAMMA_SOURCE_PROJECTS folders may not hold a folder named files',
    )
  })

  it('serves the tutorial it ships with, beside any source', async () => {
    const tutorial = {
      listing: async () => ({
        version: '1',
        files: [{ path: 'Start here.md', version: '1', size: 3 }],
      }),
      blob: async () => null,
    }
    const app = createApp(guard, undefined, undefined, null, undefined, tutorial)

    expect(await (await app.request('/api/tutorial')).json()).toEqual(await tutorial.listing())
    expect((await build().request('/api/tutorial')).status).toBe(404)
  })
})
