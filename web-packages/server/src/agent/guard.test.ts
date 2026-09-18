import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Hono } from 'hono'
import { createApp } from '../app.js'
import { readAgentConfig, readGuardConfig, type GuardConfig } from './config.js'
import { createTokenGuard } from './rate-limit.js'

const agentConfig = readAgentConfig({ GLM_API_KEY: 'server-secret' })
const devGuard: GuardConfig = { ...readGuardConfig({}), allowLocalhost: true }
const productionGuard: GuardConfig = { ...readGuardConfig({ NODE_ENV: 'production' }) }

const makeBody = (maxTokens?: number) => ({
  model: agentConfig.modelId,
  messages: [{ role: 'user', content: 'Hi' }],
  stream: true,
  ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
})

const send = (app: Hono, headers: Record<string, string>, body = makeBody()) =>
  app.request('/api/agent/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const post = (guard: GuardConfig, headers: Record<string, string>, body = makeBody()) =>
  send(createApp(undefined, agentConfig, guard), headers, body)

const withApp = (guard: GuardConfig) => createApp(undefined, agentConfig, guard)

const streamOnce = () =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('data: ok\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
  )

const silenceLogs = () => vi.spyOn(console, 'info').mockImplementation(() => {})

afterEach(() => vi.restoreAllMocks())

describe('origin guard', () => {
  it('rejects browser requests from other sites before contacting the provider', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    expect((await post(devGuard, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post(productionGuard, { Origin: 'null' })).status).toBe(403)
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('rejects localhost origins in production when the host differs', async () => {
    const headers = { Origin: 'http://localhost:5173', Host: 'reader.upivot.io' }
    expect((await post(devGuard, headers)).status).not.toBe(403)
    expect((await post(productionGuard, headers)).status).toBe(403)
  })

  it('accepts same-host and explicitly allowed origins', async () => {
    const fetchModel = streamOnce()
    const allowEmbed = {
      ...productionGuard,
      extraOrigins: ['https://partner.example'],
    } satisfies GuardConfig
    expect(
      (
        await post(productionGuard, { Origin: 'https://reader.upivot.io', Host: 'reader.upivot.io' })
      ).status,
    ).toBe(200)
    expect((await post(allowEmbed, { Origin: 'https://partner.example' })).status).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })
})

describe('token budgets', () => {
  const budgets = (overrides: Partial<GuardConfig>): GuardConfig => ({
    ...readGuardConfig({}),
    perMinute: 1000,
    dailyTokensPerIp: 1_000_000,
    dailyGlobalTokens: 1_000_000,
    ...overrides,
  })
  const forwarded = { 'X-Forwarded-For': '203.0.113.7' }

  it('caps the per-minute burst with a Retry-After header', async () => {
    silenceLogs()
    const fetchModel = streamOnce()
    const app = withApp(budgets({ perMinute: 2, trustProxy: true }))
    expect((await send(app, forwarded)).status).toBe(200)
    expect((await send(app, forwarded)).status).toBe(200)
    const burst = await send(app, forwarded)
    expect(burst.status).toBe(429)
    expect(burst.headers.get('retry-after')).toBe('60')
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })

  it('stops an address for the day once its token budget is used up', async () => {
    silenceLogs()
    const fetchModel = streamOnce()
    const app = withApp(budgets({ dailyTokensPerIp: 8, trustProxy: true }))
    expect((await send(app, forwarded, makeBody(4))).status).toBe(200)
    const exhausted = await send(app, forwarded, makeBody(4))
    expect(exhausted.status).toBe(429)
    expect(await exhausted.json()).toMatchObject({
      error: { message: expect.stringContaining('daily chat budget') },
    })
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('returns a self-host notice when the global budget is exhausted', async () => {
    silenceLogs()
    const fetchModel = streamOnce()
    const app = withApp(budgets({ dailyGlobalTokens: 10, trustProxy: true }))
    expect((await send(app, { 'X-Forwarded-For': '203.0.113.7' }, makeBody(4))).status).toBe(200)
    const circuit = await send(app, { 'X-Forwarded-For': '198.51.100.9' }, makeBody(4))
    expect(circuit.status).toBe(503)
    expect(await circuit.json()).toMatchObject({
      error: { message: expect.stringContaining('open source') },
    })
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('ignores X-Forwarded-For unless the proxy is trusted', async () => {
    silenceLogs()
    const fetchModel = streamOnce()
    const untrusted = withApp(budgets({ perMinute: 1 }))
    expect((await send(untrusted, { 'X-Forwarded-For': '203.0.113.7' })).status).toBe(200)
    expect((await send(untrusted, { 'X-Forwarded-For': '198.51.100.9' })).status).toBe(429)
    const trusted = withApp(budgets({ perMinute: 1, trustProxy: true }))
    expect((await send(trusted, { 'X-Forwarded-For': '203.0.113.7' })).status).toBe(200)
    expect((await send(trusted, { 'X-Forwarded-For': '198.51.100.9' })).status).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(3)
  })

  it('can be disabled for self-hosting', async () => {
    silenceLogs()
    const fetchModel = streamOnce()
    const app = withApp(budgets({ rateLimiting: false, perMinute: 1 }))
    expect((await send(app, forwarded)).status).toBe(200)
    expect((await send(app, forwarded)).status).toBe(200)
    expect((await send(app, forwarded)).status).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(3)
  })

  it('resets the budgets when the day rolls over', () => {
    let fakeNow = 1_000_000_000_000
    const guard = createTokenGuard(
      budgets({ perMinute: 1, dailyTokensPerIp: 4, dailyGlobalTokens: 5 }),
      () => fakeNow,
    )
    expect(guard.check('203.0.113.7', 4)).toEqual({ allowed: true })
    expect(guard.check('203.0.113.7', 1).allowed).toBe(false)
    fakeNow += 120_000
    expect(guard.check('203.0.113.7', 1).allowed).toBe(false)
    fakeNow += 86_400_000
    expect(guard.check('203.0.113.7', 4)).toEqual({ allowed: true })
  })
})
