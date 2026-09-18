import type { MiddlewareHandler } from 'hono'
import type { GuardConfig } from './config.js'

const localhostHostnames = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

const sameHost = (origin: URL, hostHeader: string | undefined): boolean => {
  if (!hostHeader) return false
  try {
    return origin.hostname === new URL(`http://${hostHeader.trim()}`).hostname
  } catch {
    return false
  }
}

/**
 * Blocks browser requests that originate from another site. Browsers enforce the
 * Origin header, so this stops other pages from embedding this endpoint. Requests
 * without an Origin header (servers, curl) pass through and are governed by the
 * token budgets instead.
 */
export const createOriginGuard = (config: GuardConfig): MiddlewareHandler => {
  const extraOrigins = new Set(config.extraOrigins)
  return async (c, next) => {
    const origin = c.req.header('origin')
    if (!origin) return next()
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      return c.json({ error: { message: 'Invalid Origin header.' } }, 403)
    }
    const allowed =
      extraOrigins.has(origin) ||
      sameHost(parsed, c.req.header('host')) ||
      (config.allowLocalhost && localhostHostnames.has(parsed.hostname.toLowerCase()))
    if (!allowed) {
      return c.json(
        { error: { message: 'This endpoint only serves the Gamma Reader site.' } },
        403,
      )
    }
    return next()
  }
}
