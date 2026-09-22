import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuotaGuard, type QuotaGuard } from './guard.js'
import { passCookieName } from './pass.js'
import { openQuotaStore, type QuotaStore, utcDay } from './store.js'

// Driven through a real request so the guard reads cookies and headers the way
// it does in the proxy, rather than from a stand-in for a context.
const serve = (guard: QuotaGuard) => {
  const app = new Hono()
  app.post('/spend', c => {
    const admission = guard.admit(c)
    if (!admission.ok)
      return new Response(JSON.stringify({ message: admission.message }), {
        status: admission.status,
      })
    admission.done(Number(c.req.query('tokens') ?? 0))
    return new Response('{}')
  })
  app.get('/held', c => new Response('', { status: guard.verify(c) ? 200 : 401 }))
  return app
}

const guardOver = (store: QuotaStore, dailyTokens: number, totalDailyTokens: number) =>
  createQuotaGuard(
    store,
    {
      databaseFile: ':memory:',
      dailyTokens,
      totalDailyTokens,
      maximumConcurrent: 64,
      trustProxy: false,
    },
    () => '203.0.113.1',
  )

const harness = (dailyTokens: number, totalDailyTokens: number) => {
  const store = openQuotaStore(':memory:')
  const guard = guardOver(store, dailyTokens, totalDailyTokens)
  const app = serve(guard)
  const spend = (tokens: number) =>
    app.request(`/spend?tokens=${tokens}`, {
      method: 'POST',
      headers: { Cookie: `${passCookieName}=${guard.pass()}` },
    })
  return { store, guard, app, spend }
}

const unlimited = Number.MAX_SAFE_INTEGER

const messageOf = async (response: Response) => {
  const body = (await response.json()) as { message?: unknown }
  expect(response.status).toBe(429)
  return String(body.message)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the shared daily ceiling', () => {
  it('turns everyone away once the day is spent, whoever spent it', async () => {
    const { spend } = harness(unlimited, 1_000)

    expect((await spend(1_000)).status).toBe(200)
    const refused = await spend(1)

    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({
      message: expect.stringContaining('shared allowance'),
    })
  })

  it('says whose allowance ran out, the reader\u2019s or the service\u2019s', async () => {
    const mine = harness(500, unlimited)
    await mine.spend(500)
    const own = await messageOf(await mine.spend(1))

    const shared = harness(unlimited, 500)
    await shared.spend(500)
    const service = await messageOf(await shared.spend(1))

    expect(own).toContain('this network')
    expect(service).toContain('shared allowance')
    expect(own).not.toBe(service)
  })

  it('counts what is already on record, so a restart does not hand out the day again', async () => {
    const { store, spend } = harness(unlimited, 1_000)
    await spend(1_000)

    // A second guard over the same rows stands in for the process starting again.
    const restarted = guardOver(store, unlimited, 1_000)
    const refused = await serve(restarted).request('/spend?tokens=1', {
      method: 'POST',
      headers: { Cookie: `${passCookieName}=${restarted.pass()}` },
    })

    expect(refused.status).toBe(429)
  })

  it('starts the count again on a new day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T12:00:00Z'))
    const { store, spend } = harness(unlimited, 1_000)
    await spend(1_000)
    expect((await spend(1)).status).toBe(429)

    vi.setSystemTime(new Date('2026-05-05T00:30:00Z'))

    expect((await spend(1)).status).toBe(200)
    expect(store.totalTokensToday(utcDay(Date.parse('2026-05-04T12:00:00Z')))).toBe(0)
  })
})

describe('holding a pass', () => {
  it('reports whether a caller holds one, without taking a slot for it', async () => {
    const { guard, app } = harness(unlimited, unlimited)

    expect((await app.request('/held')).status).toBe(401)
    expect(
      (await app.request('/held', { headers: { Cookie: `${passCookieName}=${guard.pass()}` } }))
        .status,
    ).toBe(200)
    expect(
      (await app.request('/held', { headers: { Cookie: `${passCookieName}=forged` } })).status,
    ).toBe(401)
  })
})
