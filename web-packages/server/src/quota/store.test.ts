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

  const entry = (subject: string, at: number, tokens: number) => ({
    subject,
    day: utcDay(at),
    at,
    tokens,
  })

  it('accumulates a subject per day and keeps other subjects and days apart', () => {
    const store = openQuotaStore(':memory:')
    const today = utcDay(noon)
    const tomorrow = utcDay(noon + dayMs)

    store.addUsage(entry('aaa', noon, 120))
    store.addUsage(entry('aaa', noon + 60_000, 80))
    store.addUsage(entry('bbb', noon, 5))
    store.addUsage(entry('aaa', noon + dayMs, 7))
    store.addUsage(entry('aaa', noon, 0))

    expect(store.tokensToday('aaa', today)).toBe(200)
    expect(store.tokensToday('bbb', today)).toBe(5)
    expect(store.tokensToday('aaa', tomorrow)).toBe(7)
    expect(store.tokensToday('ccc', today)).toBe(0)
    store.close()
  })

  it('keeps only the day it is pruned to', () => {
    const store = openQuotaStore(':memory:')
    const today = utcDay(noon)

    store.addUsage(entry('aaa', noon - dayMs, 10))
    store.addUsage(entry('aaa', noon, 10))
    store.prune(today)

    expect(store.tokensToday('aaa', utcDay(noon - dayMs))).toBe(0)
    expect(store.tokensToday('aaa', today)).toBe(10)
    store.close()
  })

  it('records every charged request without an address', () => {
    const file = fileIn('requests.db')
    const store = openQuotaStore(file)

    store.addUsage(entry('aaa', noon, 2480))
    store.addUsage(entry('aaa', noon + 9_000, 5120))
    store.addUsage(entry('bbb', noon + 3_000, 640))
    store.addUsage(entry('aaa', noon + 20_000, 0))
    store.prune(utcDay(noon))
    store.close()

    const database = new DatabaseSync(file)
    expect(database.prepare('SELECT * FROM usage_request ORDER BY at').all()).toEqual([
      { at: noon, tokens: 2480 },
      { at: noon + 3_000, tokens: 640 },
      { at: noon + 9_000, tokens: 5120 },
    ])
    // Pruning the day counter must not touch the permanent record.
    expect(database.prepare('SELECT SUM(tokens) AS total FROM usage_request').get()).toEqual({
      total: 8240,
    })
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
