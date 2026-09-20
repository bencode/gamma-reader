import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openQuotaStore, retentionCutoff, utcDay } from './store.js'

const dayMs = 24 * 60 * 60 * 1000

describe('quota store', () => {
  let directory: string

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gamma-reader-quota-'))
  })

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('accumulates a subject per day and keeps other subjects and days apart', () => {
    const store = openQuotaStore(':memory:')
    const today = utcDay(Date.parse('2026-09-20T23:59:00Z'))
    const tomorrow = utcDay(Date.parse('2026-09-21T00:01:00Z'))

    store.addTokens('198.51.100.4', today, 120)
    store.addTokens('198.51.100.4', today, 80)
    store.addTokens('198.51.100.9', today, 5)
    store.addTokens('198.51.100.4', tomorrow, 7)

    expect(store.tokensToday('198.51.100.4', today)).toBe(200)
    expect(store.tokensToday('198.51.100.9', today)).toBe(5)
    expect(store.tokensToday('198.51.100.4', tomorrow)).toBe(7)
    expect(store.tokensToday('203.0.113.1', today)).toBe(0)
    store.close()
  })

  it('forgets days older than the retention window', () => {
    const store = openQuotaStore(':memory:')
    const now = Date.parse('2026-09-20T12:00:00Z')
    const recent = utcDay(now - 2 * dayMs)
    const stale = utcDay(now - 30 * dayMs)

    store.addTokens('198.51.100.4', recent, 10)
    store.addTokens('198.51.100.4', stale, 10)
    store.prune(retentionCutoff(now, 7))

    expect(store.tokensToday('198.51.100.4', recent)).toBe(10)
    expect(store.tokensToday('198.51.100.4', stale)).toBe(0)
    store.close()
  })

  it('keeps the admission secret stable so restarts do not invalidate open pages', () => {
    const file = join(directory, 'quota.db')
    const first = openQuotaStore(file)
    const secret = first.passSecret()
    expect(secret).toBe(first.passSecret())
    first.close()

    const reopened = openQuotaStore(file)
    expect(reopened.passSecret()).toBe(secret)
    reopened.close()
  })
})
