import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { passRequiredMessage, type QuotaGuard } from '../quota/guard.js'
import type { PageExtractor, SearchProvider } from './provider.js'

export type WebServices = { search: SearchProvider; extract: PageExtractor }

const fail = (status: number, message: string) =>
  Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } })

const searchRequest = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('query' in body)) return null
  const { query } = body
  const count = 'count' in body ? body.count : 5
  if (typeof query !== 'string' || !query.trim() || query.length > 500) return null
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10) return null
  return { query: query.trim(), count }
}

const extractRequest = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('url' in body)) return null
  const { url } = body
  if (typeof url !== 'string' || url.length > 2000) return null
  const parsed = URL.parse(url)
  return parsed?.protocol === 'https:' || parsed?.protocol === 'http:' ? { url: parsed.href } : null
}

// A search charges nothing itself: its results reach the model in the next request, which is
// charged as usual. An extracted page goes into a file instead, so it carries a charge of its
// own, or this route would be a free page fetcher for anyone holding a pass.
const extractTokens = 2_000

type WebRoute<T> = {
  path: string
  parse: (body: unknown) => T | null
  invalid: string
  tokens: number
  timeoutMs: number
  run: (services: WebServices, request: T, signal: AbortSignal) => Promise<unknown>
}

export const createWebRoutes = (web: WebServices | undefined, guard: QuotaGuard) => {
  const app = new Hono()
  const route = <T>({ path, parse, invalid, tokens, timeoutMs, run }: WebRoute<T>) =>
    app.post(
      path,
      async (c, next) => {
        if (!guard.verify(c)) return fail(401, passRequiredMessage)
        await next()
      },
      bodyLimit({ maxSize: 4 * 1024, onError: () => fail(413, 'The request is too large.') }),
      async c => {
        if (!web) return fail(503, 'Web search is unavailable.')
        let body: unknown
        try {
          body = await c.req.json()
        } catch (cause) {
          if (!(cause instanceof SyntaxError)) throw cause
          return fail(400, 'The request is not valid JSON.')
        }
        const request = parse(body)
        if (!request) return fail(400, invalid)
        const admission = guard.admit(c)
        if (!admission.ok) return fail(admission.status, admission.message)
        // Charged only for an answer the reader gets.
        let charged = 0
        try {
          const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(timeoutMs)])
          const result = await run(web, request, signal)
          charged = tokens
          return c.json(result)
        } catch (cause) {
          console.error(`Web ${path.slice(1)} failed`, cause)
          return fail(502, 'The web service did not answer. Try again later.')
        } finally {
          admission.done(charged)
        }
      },
    )

  route({
    path: '/search',
    parse: searchRequest,
    invalid: 'Send a query of up to 500 characters and a count from 1 to 10.',
    tokens: 0,
    timeoutMs: 15_000,
    run: async ({ search }, { query, count }, signal) => ({
      results: await search(query, count, signal),
    }),
  })
  route({
    path: '/extract',
    parse: extractRequest,
    invalid: 'Send an http or https url of up to 2000 characters.',
    tokens: extractTokens,
    timeoutMs: 30_000,
    run: ({ extract }, { url }, signal) => extract(url, signal),
  })
  return app
}
