import type { Context } from 'hono'
import type { GuardConfig } from './config.js'

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; status: number; message: string; retryAfterSeconds?: number }

type DayAccount = { dayKey: number; dayTokens: number }
type IpAccount = DayAccount & { minuteHits: number[] }

const DAY_MS = 86_400_000
const IMAGE_TOKENS = 1500
/** Backstop against unbounded memory when cycled addresses flood the store. */
const MAX_TRACKED_IPS = 100_000

const globalBudgetMessage =
  'The hosted demo budget is exhausted for today. Gamma Reader is open source — clone it and run it with your own model key.'

export const createTokenGuard = (config: GuardConfig, now: () => number = Date.now) => {
  const dayKey = () => Math.floor(now() / DAY_MS)
  let global: DayAccount = { dayKey: dayKey(), dayTokens: 0 }
  const perIp = new Map<string, IpAccount>()

  const roll = (account: DayAccount) => {
    const key = dayKey()
    if (account.dayKey !== key) {
      account.dayKey = key
      account.dayTokens = 0
    }
  }

  const pruneStale = () => {
    if (perIp.size <= MAX_TRACKED_IPS) return
    const key = dayKey()
    for (const [ip, account] of perIp) {
      if (account.minuteHits.length === 0 && account.dayKey !== key) perIp.delete(ip)
    }
  }

  return {
    check(ip: string, tokens: number): GuardVerdict {
      roll(global)
      let account = perIp.get(ip)
      if (!account) {
        account = { minuteHits: [], dayKey: dayKey(), dayTokens: 0 }
        perIp.set(ip, account)
      }
      roll(account)
      pruneStale()

      const cutoff = now() - 60_000
      account.minuteHits = account.minuteHits.filter(hit => hit > cutoff)
      if (account.minuteHits.length >= config.perMinute) {
        return {
          allowed: false,
          status: 429,
          message: 'Too many requests from this address. Wait a minute and try again.',
          retryAfterSeconds: 60,
        }
      }
      if (account.dayTokens + tokens > config.dailyTokensPerIp) {
        return {
          allowed: false,
          status: 429,
          message:
            'The daily chat budget for this address is used up. Please come back tomorrow, or run Gamma Reader yourself with your own model key.',
        }
      }
      if (global.dayTokens + tokens > config.dailyGlobalTokens) {
        return { allowed: false, status: 503, message: globalBudgetMessage }
      }

      account.minuteHits.push(now())
      account.dayTokens += tokens
      global.dayTokens += tokens
      return { allowed: true }
    },
  }
}

/**
 * Client address for the budgets. X-Forwarded-For is only honoured behind a
 * reverse proxy you control (TRUST_PROXY=1); otherwise the socket address is
 * used and forwarded headers are ignored, so clients cannot spoof their way
 * past the per-IP limits.
 */
export const clientIp = (c: Context, trustProxy: boolean): string => {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for')
    const first = forwarded?.split(',')[0]?.trim()
    if (first) return first
  }
  const remote = (
    c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  )?.incoming?.socket?.remoteAddress
  return remote ?? 'unknown'
}

/**
 * Rough token estimate for budget accounting: text at ~4 characters per token,
 * a flat cost per image (base64 payloads are not walked), plus the capped
 * max_tokens. Precise enough for budgets; never billed to anyone.
 */
export const estimateTokens = (body: Record<string, unknown>): number => {
  let characters = 0
  let images = 0
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      characters += value.length
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value !== null && typeof value === 'object') {
      if ((value as { type?: unknown }).type === 'image_url') {
        images += 1
        return
      }
      for (const item of Object.values(value as Record<string, unknown>)) walk(item)
    }
  }
  walk(body.messages)
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 0
  return Math.ceil(characters / 4) + images * IMAGE_TOKENS + maxTokens
}
