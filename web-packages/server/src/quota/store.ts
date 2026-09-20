import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createPassSecret } from './pass.js'

export type QuotaStore = {
  passSecret: () => string
  tokensToday: (subject: string, day: string) => number
  addTokens: (subject: string, day: string, tokens: number) => void
  prune: (before: string) => void
  close: () => void
}

const dayMs = 24 * 60 * 60 * 1000

export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)

export const retentionCutoff = (at: number, days: number) => utcDay(at - days * dayMs)

const text = (row: Record<string, unknown> | undefined, column: string) => {
  const value = row?.[column]
  return typeof value === 'string' ? value : undefined
}

const count = (row: Record<string, unknown> | undefined, column: string) => {
  const value = row?.[column]
  return typeof value === 'number' ? value : 0
}

export const openQuotaStore = (file: string): QuotaStore => {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const database = new DatabaseSync(file)
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS usage_day (
      subject TEXT    NOT NULL,
      day     TEXT    NOT NULL,
      tokens  INTEGER NOT NULL,
      PRIMARY KEY (subject, day)
    ) STRICT;
  `)

  const readMeta = database.prepare('SELECT value FROM meta WHERE key = ?')
  const claimMeta = database.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  )
  const readTokens = database.prepare('SELECT tokens FROM usage_day WHERE subject = ? AND day = ?')
  const recordTokens = database.prepare(
    `INSERT INTO usage_day (subject, day, tokens) VALUES (?, ?, ?)
       ON CONFLICT(subject, day) DO UPDATE SET tokens = tokens + excluded.tokens`,
  )
  const deleteBefore = database.prepare('DELETE FROM usage_day WHERE day < ?')

  return {
    passSecret: () => {
      const existing = text(readMeta.get('pass_secret'), 'value')
      if (existing) return existing
      claimMeta.run('pass_secret', createPassSecret())
      const stored = text(readMeta.get('pass_secret'), 'value')
      if (!stored) throw new Error('Could not persist the admission secret.')
      return stored
    },
    tokensToday: (subject, day) => count(readTokens.get(subject, day), 'tokens'),
    addTokens: (subject, day, tokens) => {
      if (tokens > 0) recordTokens.run(subject, day, tokens)
    },
    prune: before => {
      deleteBefore.run(before)
    },
    close: () => database.close(),
  }
}
