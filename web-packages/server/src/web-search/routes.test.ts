import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { createQuotaGuard } from '../quota/guard.js'
import { passCookieName } from '../quota/pass.js'
import { openQuotaStore } from '../quota/store.js'
import type { SearchProvider } from './provider.js'

const directory = mkdtempSync(join(tmpdir(), 'gamma-reader-search-'))
const opened: { close: () => void }[] = []
afterAll(() => {
  for (const handle of opened) handle.close()
  rmSync(directory, { recursive: true, force: true })
})

// One request at a time, so a search that never released its slot would turn the next one away.
const searchApp = (provider?: SearchProvider) => {
  const databaseFile = join(directory, `${crypto.randomUUID()}.db`)
  const store = openQuotaStore(databaseFile)
  opened.push(store)
  const guard = createQuotaGuard(
    store,
    {
      databaseFile,
      dailyTokens: 1_000,
      totalDailyTokens: 1_000,
      maximumConcurrent: 1,
      trustProxy: false,
    },
    () => '198.51.100.9',
  )
  const charged = () => {
    const reader = new DatabaseSync(databaseFile)
    try {
      const rows = reader.prepare('SELECT tokens FROM usage_request').all()
      return rows.reduce((total, row) => total + Number(row.tokens), 0)
    } finally {
      reader.close()
    }
  }
  const app = createApp(guard, undefined, undefined, null, provider)
  const search = (body: unknown, cookie = `${passCookieName}=${guard.pass()}`) =>
    app.request('/api/agent/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    })
  return { search, charged }
}

const hit = { title: 'SICM 1.4', url: 'https://example.org/sicm', snippet: 'Computing actions' }

describe('web search route', () => {
  it('searches for a reader with a pass and charges nothing itself', async () => {
    const provider = vi.fn<SearchProvider>(async () => [hit])
    const { search, charged } = searchApp(provider)

    const first = await search({ query: '  stationary action  ' })
    const second = await search({ query: 'Lagrangian', count: 10 })

    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ results: [hit] })
    expect(second.status).toBe(200)
    expect(provider.mock.calls.map(([query, count]) => [query, count])).toEqual([
      ['stationary action', 5],
      ['Lagrangian', 10],
    ])
    expect(charged()).toBe(0)
  })

  it('turns away strangers and malformed requests before searching', async () => {
    const provider = vi.fn<SearchProvider>(async () => [hit])
    const { search } = searchApp(provider)

    expect((await search({ query: 'x' }, '')).status).toBe(401)
    expect((await search({ query: '   ' })).status).toBe(400)
    expect((await search({ query: 'x', count: 11 })).status).toBe(400)
    expect((await search({ query: 'x'.repeat(501) })).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
  })

  it('reports a failed or unconfigured search without the upstream detail', async () => {
    const failing = searchApp(async () => {
      throw new Error('Tavily answered 500: secret detail')
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failed = await failing.search({ query: 'x' })

    expect(failed.status).toBe(502)
    expect(JSON.stringify(await failed.json())).not.toContain('secret detail')
    expect((await failing.search({ query: 'again' })).status).toBe(502)
    expect((await searchApp().search({ query: 'x' })).status).toBe(503)
  })
})
