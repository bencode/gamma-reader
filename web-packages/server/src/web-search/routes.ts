import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { passRequiredMessage, type QuotaGuard } from '../quota/guard.js'
import type { SearchProvider } from './provider.js'

const fail = (status: number, message: string) =>
  Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } })

type SearchRequest = { query: string; count: number }

const searchRequest = (body: unknown): SearchRequest | null => {
  if (typeof body !== 'object' || body === null || !('query' in body)) return null
  const { query } = body
  const count = 'count' in body ? body.count : 5
  if (typeof query !== 'string' || !query.trim() || query.length > 500) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) return null
  return { query: query.trim(), count }
}

// A search is admitted like a model request but charges nothing itself: its results reach the
// model in the next request, which is charged as usual.
export const createWebSearchRoutes = (provider: SearchProvider | undefined, guard: QuotaGuard) => {
  const app = new Hono()
  app.post(
    '/search',
    async (c, next) => {
      if (!guard.verify(c)) return fail(401, passRequiredMessage)
      await next()
    },
    bodyLimit({ maxSize: 4 * 1024, onError: () => fail(413, 'The search request is too large.') }),
    async c => {
      if (!provider) return fail(503, 'Web search is unavailable.')
      let body: unknown
      try {
        body = await c.req.json()
      } catch (cause) {
        if (!(cause instanceof SyntaxError)) throw cause
        return fail(400, 'The request is not valid JSON.')
      }
      const request = searchRequest(body)
      if (!request)
        return fail(400, 'Send a query of up to 500 characters and a count from 1 to 10.')
      const admission = guard.admit(c)
      if (!admission.ok) return fail(admission.status, admission.message)
      try {
        const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(15_000)])
        return c.json({ results: await provider(request.query, request.count, signal) })
      } catch (cause) {
        console.error('Web search failed', cause)
        return fail(502, 'The web search did not answer. Try again later.')
      } finally {
        admission.done(0)
      }
    },
  )
  return app
}
