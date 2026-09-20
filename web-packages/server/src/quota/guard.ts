import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { issuePass, passCookieName, verifyPass } from './pass.js'
import { type QuotaStore, utcDay } from './store.js'

export type QuotaConfig = {
  databaseFile: string
  dailyTokens: number
  maximumConcurrent: number
  trustProxy: boolean
}

export type Admission =
  | { ok: true; subject: string; done: (tokens: number) => void }
  | { ok: false; status: number; message: string }

export type QuotaGuard = {
  pass: () => string
  admit: (c: Context) => Admission
}

// Token spend is only known once a response completes, so a burst admitted
// together would all pass the daily check before any of them is recorded.
const defaultMaximumConcurrent = 4

const defaultDailyTokens = 200_000

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
  const secret = store.passSecret()
  const inFlight = new Map<string, number>()

  // A reverse proxy appends the connecting peer to X-Forwarded-For, so only the
  // last entry is trustworthy; earlier ones are supplied by the caller.
  const subjectOf = (c: Context) =>
    (config.trustProxy ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() : undefined) ||
    remoteAddress(c) ||
    'unknown'

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
      const subject = subjectOf(c)
      const active = inFlight.get(subject) ?? 0
      if (active >= config.maximumConcurrent)
        return {
          ok: false,
          status: 429,
          message: 'Too many chat requests at once. Wait for the current answer to finish.',
        }
      if (store.tokensToday(subject, utcDay(Date.now())) >= config.dailyTokens)
        return {
          ok: false,
          status: 429,
          message: 'The daily chat limit for this network is used up. It resets at 00:00 UTC.',
        }
      inFlight.set(subject, active + 1)
      let settled = false
      return {
        ok: true,
        subject,
        done: tokens => {
          if (settled) return
          settled = true
          release(subject)
          store.addTokens(subject, utcDay(Date.now()), tokens)
        },
      }
    },
  }
}
