import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { serve } from '@hono/node-server'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { createQuotaGuard } from '../quota/guard.js'
import { passCookieName } from '../quota/pass.js'
import { openQuotaStore } from '../quota/store.js'
import { resolveModelProxyConfig } from './config.js'
import settings from './providers.json' with { type: 'json' }

const config = resolveModelProxyConfig(settings, {
  GLM_API_KEY: 'server-secret',
  DEEPSEEK_API_KEY: 'deepseek-secret',
})
const directory = mkdtempSync(join(tmpdir(), 'gamma-reader-routes-'))
const opened: { close: () => void }[] = []
afterAll(() => {
  for (const handle of opened) handle.close()
  rmSync(directory, { recursive: true, force: true })
})

// Charged tokens are read back from the address-free record, so the assertions
// do not depend on how a subject key is derived.
const quotaFor = (dailyTokens: number, address: string, maximumConcurrent: number) => {
  const databaseFile = join(directory, `${address}.db`)
  const store = openQuotaStore(databaseFile)
  opened.push(store)
  const guard = createQuotaGuard(
    store,
    { databaseFile, dailyTokens, maximumConcurrent, trustProxy: false },
    () => address,
  )
  const charged = () => {
    const reader = new DatabaseSync(databaseFile)
    try {
      const rows = reader.prepare('SELECT tokens FROM usage_request').all()
      return rows.reduce((total, row) => total + Number(row.tokens), 0)
    } finally {
      reader.close()
    }
  }
  return { guard, charged, cookie: `${passCookieName}=${guard.pass()}` }
}
// The shared app leaves most responses undrained, which legitimately holds a
// concurrency slot open, so give it more room than any single test needs.
const unlimited = quotaFor(Number.MAX_SAFE_INTEGER, '198.51.100.4', 64)
const app = createApp(unlimited.guard, undefined, config)
const body = {
  model: settings.defaultModel.modelId,
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
}
const post = (
  input: unknown = body,
  path = '/api/agent/providers/zai-coding-cn/chat/completions',
) =>
  app.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer browser-placeholder',
      Cookie: unlimited.cookie,
    },
    body: JSON.stringify(input),
  })
afterEach(() => vi.restoreAllMocks())

describe('model proxy', () => {
  const eventStream = (payload: string) =>
    new Response(payload, { headers: { 'Content-Type': 'text/event-stream' } })
  const finalChunk = (total: number) =>
    `data: {"choices":[{"index":0,"finish_reason":"stop","delta":{}}],"usage":{"total_tokens":${total}}}\n\ndata: [DONE]\n\n`

  it('admits only callers that fetched the configuration and charges reported usage', async () => {
    const { charged, guard, cookie } = quotaFor(10, '203.0.113.7', 4)
    const limited = createApp(guard, undefined, config)
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => eventStream(finalChunk(14)))
    const send = (headers: Record<string, string> = {}) =>
      limited.request('/api/agent/providers/zai-coding-cn/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })

    const anonymous = await send()
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toEqual({
      error: { message: 'Reload Gamma Reader to continue chatting.' },
    })
    expect(fetchModel).not.toHaveBeenCalled()

    const allowed = await send({ Cookie: cookie })
    expect(allowed.status).toBe(200)
    expect(await allowed.text()).toBe(finalChunk(14))
    await vi.waitFor(() => expect(charged()).toBe(14))

    const exhausted = await send({ Cookie: cookie })
    expect(exhausted.status).toBe(429)
    expect(await exhausted.json()).toEqual({
      error: {
        message: 'The daily chat limit for this network is used up. It resets at 00:00 UTC.',
      },
    })
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  const stalling = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: first\n\n'))
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )

  const stopMidAnswer = async (
    app: ReturnType<typeof createApp>,
    cookie: string,
    sent: unknown,
  ) => {
    const client = new AbortController()
    const response = await app.request(
      '/api/agent/providers/zai-coding-cn/vision/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(sent),
        signal: client.signal,
      },
    )
    expect(response.status).toBe(200)
    client.abort()
  }

  it('charges a stopped image analysis per image and for the answer it asked for', async () => {
    const { charged, guard, cookie } = quotaFor(Number.MAX_SAFE_INTEGER, '203.0.113.9', 4)
    const vision = createApp(guard, undefined, config)
    stalling()
    // A megabyte of base64 would be ~262,000 tokens priced by size, which alone
    // exceeds a day's allowance; the provider prices an image by its pixels.
    const image = `data:image/jpeg;base64,${'A'.repeat(1024 * 1024)}`

    await stopMidAnswer(vision, cookie, {
      ...body,
      model: settings.visionModel.modelId,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: image } }] }],
    })

    // One image plus the output ceiling the caller asked for, and little else:
    // leaving the output out is what made this charge wrong three times over.
    await vi.waitFor(() => expect(charged()).toBeGreaterThanOrEqual(6_000 + 4_096))
    expect(charged()).toBeLessThan(6_000 + 4_096 + 1_000)
  })

  it('charges text sent to the image route by its size, leaving no cheaper way in', async () => {
    const { charged, guard, cookie } = quotaFor(Number.MAX_SAFE_INTEGER, '203.0.113.10', 4)
    const vision = createApp(guard, undefined, config)
    stalling()
    // Nothing requires an image here, so a flat per-image charge would have made
    // this route a discount on the same text sent to the conversation one.
    const prose = 'x'.repeat(1024 * 1024)

    await stopMidAnswer(vision, cookie, {
      ...body,
      model: settings.visionModel.modelId,
      messages: [{ role: 'user', content: prose }],
    })

    await vi.waitFor(() => expect(charged()).toBeGreaterThan(250_000))
  })

  it('releases its concurrency slot after streamed, rejected and unusable responses', async () => {
    const { charged, guard, cookie } = quotaFor(Number.MAX_SAFE_INTEGER, '203.0.113.8', 4)
    const generous = createApp(guard, undefined, config)
    const send = () =>
      generous.request('/api/agent/providers/zai-coding-cn/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      })
    const drain = async (outcome: () => Response) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => outcome())
      const response = await send()
      await response.text()
      return response.status
    }

    // More attempts than the concurrency allowance: a slot that outlives its
    // request would make the later ones fail with 429 instead.
    for (let attempt = 0; attempt < 6; attempt++) {
      expect(await drain(() => eventStream(finalChunk(3)))).toBe(200)
      expect(await drain(() => new Response('nope', { status: 500 }))).toBe(500)
      expect(await drain(() => Response.json({ not: 'a stream' }))).toBe(502)
    }
    // Only the six streamed responses are charged; failed upstreams cost nothing.
    expect(charged()).toBe(18)
  })

  it('routes each provider to its own upstream and credential', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      )
    const path = '/api/agent/providers/deepseek/chat/completions'
    expect((await post({ ...body, model: 'deepseek-v4-pro' }, path)).status).toBe(200)
    expect(upstream.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions')
    expect(upstream.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer deepseek-secret',
    })
    expect((await post()).status).toBe(200)
    expect(upstream.mock.calls[1]?.[0]).toBe(
      'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
    )
    expect(upstream.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer server-secret',
    })
    expect((await post(body, path)).status).toBe(400)
    expect((await post({ ...body, model: 'deepseek-v4-pro' })).status).toBe(400)
    expect((await post(body, '/api/agent/providers/unknown/chat/completions')).status).toBe(404)
    expect((await post(body, '/api/agent/providers/toString/chat/completions')).status).toBe(404)
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('publishes only model configuration and injects the server key while preserving SSE', async () => {
    const publicConfig = await app.request('/api/agent/config')
    expect(await publicConfig.json()).toEqual({
      enabled: true,
      providers: [
        { id: 'zai-coding-cn', chatModels: ['glm-5.3', 'glm-5.2'] },
        { id: 'deepseek', chatModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
      ],
      defaultModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3' },
      visionModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3-flash' },
    })
    expect(publicConfig.headers.get('cache-control')).toBe('no-store')
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: first\n\ndata: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const response = await post({ ...body, thinking: { type: 'enabled' } })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await response.text()).toBe('data: first\n\ndata: [DONE]\n\n')
    expect(fetchModel.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer server-secret',
    })
    expect(JSON.parse(String(fetchModel.mock.calls[0]?.[1]?.body))).toEqual({
      ...body,
      thinking: { type: 'enabled' },
    })
  })

  it('forwards configured chat models and their effort while rejecting models outside the catalog', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      )
    const selected = {
      ...body,
      model: 'glm-5.2',
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    }
    expect((await post(selected)).status).toBe(200)
    expect(JSON.parse(String(fetchModel.mock.calls[0]?.[1]?.body))).toEqual(selected)
    expect((await post({ ...selected, model: 'unconfigured-model' })).status).toBe(400)
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('isolates the main and vision models on endpoints with separate limits', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('data: done\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      )
    const visionBody = { ...body, model: settings.visionModel.modelId }
    expect((await post(visionBody)).status).toBe(400)
    expect(
      (await post(body, '/api/agent/providers/zai-coding-cn/vision/chat/completions')).status,
    ).toBe(400)
    expect(
      (await post(visionBody, '/api/agent/providers/zai-coding-cn/vision/chat/completions')).status,
    ).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('rejects unavailable, oversized and invalid requests without contacting the provider', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    expect((await createApp(unlimited.guard).request('/api/agent/config')).status).toBe(200)
    expect(await (await createApp(unlimited.guard).request('/api/agent/config')).json()).toEqual({
      enabled: false,
    })
    expect(
      (
        await createApp(unlimited.guard, undefined, resolveModelProxyConfig(settings, {})).request(
          '/api/agent/providers/zai-coding-cn/chat/completions',
          { method: 'POST' },
        )
      ).status,
    ).toBe(503)
    expect((await post({ ...body, model: 'other' })).status).toBe(400)
    expect((await post({ ...body, stream: false })).status).toBe(400)
    expect(
      (
        await app.request('/api/agent/providers/zai-coding-cn/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
    ).toBe(400)
    expect((await post({ ...body, messages: ['x'.repeat(2 * 1024 * 1024)] })).status).toBe(413)
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('reports provider errors without exposing private diagnostics', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('private diagnostic', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ unexpected: true }))
      .mockRejectedValueOnce(new TypeError('private connection detail'))
    const rejected = await post()
    expect(rejected.status).toBe(429)
    expect(await rejected.text()).not.toContain('private diagnostic')
    expect((await post()).status).toBe(502)
    const failed = await post()
    expect(failed.status).toBe(502)
    expect(await failed.text()).not.toContain('private connection detail')
    expect(fetchModel).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Model connection failed', { name: 'TypeError' })
  })

  it('times out upstream requests', async () => {
    vi.useFakeTimers()
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      setTimeout(() => timeout.abort(), ms)
      return timeout.signal
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    try {
      const response = post()
      await vi.advanceTimersByTimeAsync(300_000)
      expect((await response).status).toBe(504)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the upstream stream when an HTTP client disconnects', async () => {
    let signal: AbortSignal | null | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      signal = init?.signal
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: first\n\n'))
            signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
    try {
      await new Promise<void>(resolve => server.once('listening', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing test server address')
      await new Promise<void>((resolve, reject) => {
        const client = request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: '/api/agent/providers/zai-coding-cn/chat/completions',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: unlimited.cookie },
          },
          response => {
            response.once('data', () => {
              response.destroy()
              resolve()
            })
            response.once('error', reject)
          },
        )
        client.once('error', reject)
        client.end(JSON.stringify(body))
      })
      await vi.waitFor(() => expect(signal?.aborted).toBe(true))
    } finally {
      if ('closeAllConnections' in server) server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    }
  })
})
