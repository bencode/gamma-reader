import { createHash } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { QuotaConfig } from './config.js'
import { networkOf } from './network.js'
import { issuePass, passCookieName, verifyPass } from './pass.js'
import { type QuotaStore, utcDay } from './store.js'

// Shared with the route that turns a stranger away before it reads their body,
// so the two refusals cannot drift apart.
export const passRequiredMessage = 'Reload Gamma Reader to continue chatting.'

export type Admission =
  | { ok: true; done: (tokens: number) => void }
  | { ok: false; status: number; message: string }

export type QuotaGuard = {
  pass: () => string
  // Whether the caller holds a pass, on its own, so a route can turn away a
  // stranger before it buffers and parses whatever they sent.
  verify: (c: Context) => boolean
  admit: (c: Context) => Admission
  // Whether forwarded headers may be believed, which the routes also need when
  // deciding if the pass cookie is being issued over a secure connection.
  trustProxy: boolean
}

export const createQuotaGuard = (
  store: QuotaStore,
  config: QuotaConfig,
  remoteAddress: (c: Context) => string | undefined = c => getConnInfo(c).remote.address,
): QuotaGuard => {
  const secret = store.secret('pass_secret')
  const salt = store.secret('subject_salt')
  const inFlight = new Map<string, number>()
  let prunedDay = ''
  // What everyone together has spent on `prunedDay`. Summing the table on every
  // request would be wasteful, and a restart reseeds it from the same rows.
  let spentToday = 0

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
    return createHash('sha256').update(salt).update(networkOf(address)).digest('hex')
  }

  // Yesterday's rows answer nothing the quota asks, so drop them the first time
  // a request arrives on a new day. Startup pruning alone would let a process
  // that runs for weeks accumulate weeks of addresses.
  const rollOver = (day: string) => {
    if (day === prunedDay) return
    // Recorded only once both succeed: a transient failure here must be retried
    // by the next request, not silently skipped for the rest of the day.
    store.prune(day)
    spentToday = store.totalTokensToday(day)
    prunedDay = day
  }

  const release = (subject: string) => {
    const remaining = (inFlight.get(subject) ?? 1) - 1
    if (remaining > 0) inFlight.set(subject, remaining)
    else inFlight.delete(subject)
  }

  const verify = (c: Context) => verifyPass(secret, getCookie(c, passCookieName))

  return {
    trustProxy: config.trustProxy,
    pass: () => issuePass(secret),
    verify,
    admit: c => {
      if (!verify(c)) return { ok: false, status: 401, message: passRequiredMessage }
      const at = Date.now()
      const day = utcDay(at)
      rollOver(day)
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
      // Checked after the per-network limit so that a reader who has spent their
      // own allowance is told that, rather than that the service ran out.
      if (spentToday >= config.totalDailyTokens)
        return {
          ok: false,
          status: 429,
          message:
            'Gamma Reader has used up the shared allowance for today. It resets at 00:00 UTC, and a model key of your own is not affected.',
        }
      inFlight.set(subject, active + 1)
      let settled = false
      return {
        ok: true,
        done: tokens => {
          if (settled) return
          settled = true
          release(subject)
          const settledAt = Date.now()
          const settledDay = utcDay(settledAt)
          try {
            store.addUsage({ subject, day: settledDay, at: settledAt, tokens })
            // Only when it lands on the day being tracked; one that settles after
            // midnight belongs to a total the next request reseeds anyway.
            if (settledDay === prunedDay) spentToday += tokens
          } catch (cause) {
            // This runs inside the response stream's callbacks, so a failure to
            // record must not tear down an answer the reader is already reading.
            console.error('Could not record usage', cause)
          }
        },
      }
    },
  }
}
