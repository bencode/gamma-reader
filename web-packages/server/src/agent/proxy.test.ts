import { request } from 'node:http'
import { serve } from '@hono/node-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { readAgentConfig, readGuardConfig } from './config.js'

const config = readAgentConfig({ GLM_API_KEY: 'server-secret' })
const app = createApp(undefined, config)
const body = { model: config.modelId, messages: [{ role: 'user', content: 'Hello' }], stream: true }
const post = (input: unknown = body, path = '/api/agent/chat/completions') =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer browser-placeholder' },
    body: JSON.stringify(input),
  })
afterEach(() => vi.restoreAllMocks())

describe('model proxy', () => {
  it('publishes only model configuration and injects the server key while preserving SSE', async () => {
    const publicConfig = await app.request('/api/agent/config')
    expect(await publicConfig.json()).toEqual({
      enabled: true,
      provider: 'zai-coding-cn',
      modelId: 'glm-5.3',
      visionModelId: 'glm-5.3-flash',
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
      max_tokens: 16_384,
      thinking: { type: 'enabled' },
    })
  })

  it('isolates the main and vision models on endpoints with separate limits', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('data: done\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      )
    const visionBody = { ...body, model: config.visionModelId }
    expect((await post(visionBody)).status).toBe(400)
    expect((await post(body, '/api/agent/vision/chat/completions')).status).toBe(400)
    expect((await post(visionBody, '/api/agent/vision/chat/completions')).status).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('rejects unavailable, oversized and invalid requests without contacting the provider', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    expect((await createApp().request('/api/agent/config')).status).toBe(200)
    expect(await (await createApp().request('/api/agent/config')).json()).toEqual({
      enabled: false,
    })
    expect(
      (await createApp().request('/api/agent/chat/completions', { method: 'POST' })).status,
    ).toBe(503)
    expect((await post({ ...body, model: 'other' })).status).toBe(400)
    expect((await post({ ...body, stream: false })).status).toBe(400)
    expect(
      (
        await app.request('/api/agent/chat/completions', {
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

  it('injects and clamps the output token ceiling', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response('data: done\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      )
    await post({ ...body, max_tokens: 999_999 })
    await post()
    await post({ ...body, max_tokens: 512 })
    const sent = fetchModel.mock.calls.map(
      call => JSON.parse(String(call[1]?.body)).max_tokens as number,
    )
    expect(sent).toEqual([16_384, 16_384, 512])
  })

  it('rejects requests whose max_tokens is not a positive integer', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    for (const maxTokens of ['many', 0, -1, 1.5]) {
      expect((await post({ ...body, max_tokens: maxTokens })).status).toBe(400)
    }
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('caps oversized model streams', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${'x'.repeat(64)}\n\n`))
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    const capped = createApp(undefined, config, { ...readGuardConfig({}), maxStreamBytes: 128 })
    const response = await capped.request('/api/agent/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await expect(response.text()).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith('Capped an oversized model stream', { maxBytes: 128 })
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
            path: '/api/agent/chat/completions',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
