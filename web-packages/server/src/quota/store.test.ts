import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openQuotaStore, utcDay } from './store.js'

const dayMs = 24 * 60 * 60 * 1000
const noon = Date.parse('2026-09-20T12:00:00Z')

describe('quota store', () => {
  let directory: string
  const fileIn = (name: string) => join(directory, name)

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gamma-reader-quota-'))
  })

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  const entry = (subject: string, at: number, burst: number, tokens: number) => ({
    subject,
    day: utcDay(at),
    at,
    burst,
    tokens,
  })

  it('accumulates a subject per day and keeps other subjects and days apart', () => {
    const store = openQuotaStore(':memory:')
    const today = utcDay(noon)
    const tomorrow = utcDay(noon + dayMs)

    store.addUsage(entry('aaa', noon, 1, 120))
    store.addUsage(entry('aaa', noon + 60_000, 1, 80))
    store.addUsage(entry('bbb', noon, 2, 5))
    store.addUsage(entry('aaa', noon + dayMs, 3, 7))
    store.addUsage(entry('aaa', noon, 4, 0))

    expect(store.tokensToday('aaa', today)).toBe(200)
    expect(store.tokensToday('bbb', today)).toBe(5)
    expect(store.tokensToday('aaa', tomorrow)).toBe(7)
    expect(store.tokensToday('ccc', today)).toBe(0)
    store.close()
  })

  it('keeps only the day it is pruned to', () => {
    const store = openQuotaStore(':memory:')
    const today = utcDay(noon)

    store.addUsage(entry('aaa', noon - dayMs, 1, 10))
    store.addUsage(entry('aaa', noon, 2, 10))
    store.prune(today)

    expect(store.tokensToday('aaa', utcDay(noon - dayMs))).toBe(0)
    expect(store.tokensToday('aaa', today)).toBe(10)
    store.close()
  })

  it('records every charged request without an address, grouped by burst', () => {
    const file = fileIn('requests.db')
    const store = openQuotaStore(file)

    store.addUsage(entry('aaa', noon, 11, 2480))
    store.addUsage(entry('aaa', noon + 9_000, 11, 5120))
    store.addUsage(entry('bbb', noon + 3_000, 22, 640))
    store.addUsage(entry('aaa', noon + 20_000, 11, 0))
    store.prune(utcDay(noon))
    store.close()

    const database = new DatabaseSync(file)
    expect(database.prepare('SELECT * FROM usage_request ORDER BY at').all()).toEqual([
      { at: noon, burst: 11, tokens: 2480 },
      { at: noon + 3_000, burst: 22, tokens: 640 },
      { at: noon + 9_000, burst: 11, tokens: 5120 },
    ])
    // Pruning the day counter must not touch the permanent record.
    expect(
      database
        .prepare('SELECT burst, SUM(tokens) AS total FROM usage_request GROUP BY burst ORDER BY 1')
        .all(),
    ).toEqual([
      { burst: 11, total: 7600 },
      { burst: 22, total: 640 },
    ])
    database.close()
  })

  it('keeps each secret stable so restarts do not invalidate open pages', () => {
    const file = fileIn('secrets.db')
    const first = openQuotaStore(file)
    const pass = first.secret('pass_secret')
    const salt = first.secret('subject_salt')

    expect(pass).toBe(first.secret('pass_secret'))
    expect(salt).not.toBe(pass)
    first.close()

    const reopened = openQuotaStore(file)
    expect(reopened.secret('pass_secret')).toBe(pass)
    expect(reopened.secret('subject_salt')).toBe(salt)
    reopened.close()
  })
})
