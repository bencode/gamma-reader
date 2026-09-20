import { createHash } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { burstLifetimeMs, createBurstTracker } from './burst.js'
import { issuePass, passCookieName, verifyPass } from './pass.js'
import { type QuotaStore, utcDay } from './store.js'

export type QuotaConfig = {
  databaseFile: string
  dailyTokens: number
  maximumConcurrent: number
  trustProxy: boolean
}

export type Admission =
  | { ok: true; done: (tokens: number) => void }
  | { ok: false; status: number; message: string }

export type QuotaGuard = {
  pass: () => string
  admit: (c: Context) => Admission
}

// Token spend is only known once a response completes, so a burst admitted
// together would all pass the daily check before any of them is recorded.
const defaultMaximumConcurrent = 4

const defaultDailyTokens = 1_000_000

const dailyTokensFrom = (raw: string | undefined) => {
  if (raw === undefined || raw.trim() === '') return defaultDailyTokens
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('GAMMA_DAILY_TOKENS must be a positive integer')
  return value
}

export const readQuotaConfig = (env: Record<string, string | undefined>): QuotaConfig => ({
  databaseFile: `${env.GAMMA_DATA_DIR?.trim() || 'data'}/gamma-reader.db`,
  dailyTokens: dailyTokensFrom(env.GAMMA_DAILY_TOKENS),
  maximumConcurrent: defaultMaximumConcurrent,
  trustProxy: env.GAMMA_TRUST_PROXY?.trim() === '1',
})

export const createQuotaGuard = (
  store: QuotaStore,
  config: QuotaConfig,
  remoteAddress: (c: Context) => string | undefined = c => getConnInfo(c).remote.address,
): QuotaGuard => {
  const secret = store.secret('pass_secret')
  const salt = store.secret('subject_salt')
  const inFlight = new Map<string, number>()
  const bursts = createBurstTracker()
  let prunedDay = ''

  // A reverse proxy appends the connecting peer to X-Forwarded-For, so only the
  // last entry is trustworthy; earlier ones are supplied by the caller. The
  // address is hashed so the stored counter is not a list of visitors; the hash
  // is reversible by anyone holding the file, which is why it only ever keeps
  // the current day.
  const subjectOf = (c: Context) => {
    const address =
      (config.trustProxy
        ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
        : undefined) ||
      remoteAddress(c) ||
      'unknown'
    return createHash('sha256').update(salt).update(address).digest('hex')
  }

  // Yesterday's rows answer nothing the quota asks, so drop them the first time
  // a request arrives on a new day. Startup pruning alone would let a process
  // that runs for weeks accumulate weeks of addresses.
  const rollOver = (day: string, at: number) => {
    if (day === prunedDay) return
    prunedDay = day
    store.prune(day)
    bursts.sweep(at - burstLifetimeMs)
  }

  const release = (subject: string) => {
    const remaining = (inFlight.get(subject) ?? 1) - 1
    if (remaining > 0) inFlight.set(subject, remaining)
    else inFlight.delete(subject)
  }

  return {
    pass: () => issuePass(secret),
    admit: c => {
      if (!verifyPass(secret, getCookie(c, passCookieName)))
        return { ok: false, status: 401, message: 'Reload Gamma Reader to continue chatting.' }
      const at = Date.now()
      const day = utcDay(at)
      rollOver(day, at)
      const subject = subjectOf(c)
      const active = inFlight.get(subject) ?? 0
      if (active >= config.maximumConcurrent)
        return {
          ok: false,
          status: 429,
          message: 'Too many chat requests at once. Wait for the current answer to finish.',
        }
      if (store.tokensToday(subject, day) >= config.dailyTokens)
        return {
          ok: false,
          status: 429,
          message: 'The daily chat limit for this network is used up. It resets at 00:00 UTC.',
        }
      inFlight.set(subject, active + 1)
      const burst = bursts.of(subject, at)
      let settled = false
      return {
        ok: true,
        done: tokens => {
          if (settled) return
          settled = true
          release(subject)
          const settledAt = Date.now()
          store.addUsage({ subject, day: utcDay(settledAt), at: settledAt, burst, tokens })
        },
      }
    },
  }
}
