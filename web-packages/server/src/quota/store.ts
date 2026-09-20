import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type UsageEntry = {
  subject: string
  day: string
  at: number
  tokens: number
}

export type QuotaStore = {
  secret: (key: string) => string
  tokensToday: (subject: string, day: string) => number
  addUsage: (entry: UsageEntry) => void
  prune: (before: string) => void
  close: () => void
}

export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)

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
    CREATE TABLE IF NOT EXISTS usage_request (
      at     INTEGER NOT NULL,
      tokens INTEGER NOT NULL
    ) STRICT;
  `)

  const readMeta = database.prepare('SELECT value FROM meta WHERE key = ?')
  const claimMeta = database.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  )
  const readTokens = database.prepare('SELECT tokens FROM usage_day WHERE subject = ? AND day = ?')
  const recordDay = database.prepare(
    `INSERT INTO usage_day (subject, day, tokens) VALUES (?, ?, ?)
       ON CONFLICT(subject, day) DO UPDATE SET tokens = tokens + excluded.tokens`,
  )
  const recordRequest = database.prepare('INSERT INTO usage_request (at, tokens) VALUES (?, ?)')
  const deleteBefore = database.prepare('DELETE FROM usage_day WHERE day < ?')

  return {
    secret: key => {
      const existing = text(readMeta.get(key), 'value')
      if (existing) return existing
      claimMeta.run(key, randomBytes(32).toString('base64url'))
      const stored = text(readMeta.get(key), 'value')
      if (!stored) throw new Error(`Could not persist the ${key} secret.`)
      return stored
    },
    tokensToday: (subject, day) => count(readTokens.get(subject, day), 'tokens'),
    // One transaction: a counter charged without its matching record would make
    // the permanent totals disagree with what readers were actually charged.
    addUsage: ({ subject, day, at, tokens }) => {
      if (tokens <= 0) return
      database.exec('BEGIN IMMEDIATE')
      try {
        recordDay.run(subject, day, tokens)
        recordRequest.run(at, tokens)
        database.exec('COMMIT')
      } catch (cause) {
        database.exec('ROLLBACK')
        throw cause
      }
    },
    prune: before => {
      deleteBefore.run(before)
    },
    close: () => database.close(),
  }
}
