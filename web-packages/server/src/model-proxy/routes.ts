import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { setCookie } from 'hono/cookie'
import type { Admission, QuotaGuard } from '../quota/guard.js'
import { passCookieName, passLifetimeMs } from '../quota/pass.js'
import { createUsageSniffer } from '../quota/usage.js'
import type { ModelProxyConfig } from './config.js'

type Granted = Extract<Admission, { ok: true }>

const fail = (status: number, message: string) =>
  Response.json({ error: { message } }, { status, headers: { 'Cache-Control': 'no-store' } })

const validBody = (body: unknown, modelIds: readonly string[]): body is Record<string, unknown> =>
  typeof body === 'object' &&
  body !== null &&
  'model' in body &&
  typeof body.model === 'string' &&
  modelIds.includes(body.model) &&
  'messages' in body &&
  Array.isArray(body.messages) &&
  'stream' in body &&
  body.stream === true

const forward = async (
  body: Record<string, unknown>,
  config: ModelProxyConfig['providers'][string],
  client: AbortSignal,
  granted: Granted,
) => {
  const payload = JSON.stringify(body)
  // Charged when the provider reports no usage, which happens when the reader
  // stops an answer the model has already processed.
  const estimate = Math.ceil(Buffer.byteLength(payload) / 4)
  const timeout = AbortSignal.timeout(300_000)
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([client, timeout]),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: payload,
    })
    if (!response.ok) {
      await response.body?.cancel()
      granted.done(0)
      console.warn('Model request rejected', { status: response.status })
      return fail(response.status, `The model provider returned HTTP ${response.status}.`)
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel()
      granted.done(0)
      console.warn('Model response was not an event stream')
      return fail(502, 'The model provider returned an invalid response.')
    }
    const metered = response.body.pipeThrough(
      createUsageSniffer(total => granted.done(total ?? estimate)),
    )
    return new Response(metered, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (cause) {
    granted.done(0)
    if (client.aborted) return fail(499, 'The request was cancelled.')
    if (timeout.aborted) return fail(504, 'The model request timed out.')
    console.error('Model connection failed', {
      name: cause instanceof Error ? cause.name : 'UnknownError',
    })
    return fail(502, 'Could not connect to the model provider.')
  }
}

export const createModelProxyRoutes = (config: ModelProxyConfig, guard: QuotaGuard) => {
  const app = new Hono()
  app.get('/config', c => {
    c.header('Cache-Control', 'no-store')
    setCookie(c, passCookieName, guard.pass(), {
      path: '/api/agent',
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: passLifetimeMs / 1000,
      secure:
        c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:',
    })
    return c.json(config.publicConfig)
  })
  const register = (path: string, vision: boolean, maximumBytes: number, label: string) => {
    app.post(
      path,
      bodyLimit({
        maxSize: maximumBytes,
        onError: () => fail(413, `The ${label} exceeds the request limit.`),
      }),
      async c => {
        const id = c.req.param('provider')
        const provider =
          id && Object.hasOwn(config.providers, id) ? config.providers[id] : undefined
        if (!provider) return fail(404, 'Unknown model provider.')
        if (!provider.apiKey) return fail(503, 'The model provider is currently unavailable.')
        const visionModel = config.publicConfig.enabled
          ? config.publicConfig.visionModel
          : undefined
        if (vision && !visionModel) return fail(503, 'Image analysis is currently unavailable.')
        const modelIds = vision
          ? visionModel && visionModel.provider === id
            ? [visionModel.modelId]
            : []
          : provider.chatModels
        if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/json')
          return fail(400, 'Use application/json.')
        let body: unknown
        try {
          body = await c.req.json()
        } catch (cause) {
          if (!(cause instanceof SyntaxError)) throw cause
          return fail(400, 'The request is not valid JSON.')
        }
        if (!validBody(body, modelIds))
          return fail(400, 'Use the configured model, messages and stream: true.')
        // Last check before forwarding: a granted admission holds a concurrency
        // slot that only `done` releases, so nothing may return early after it.
        const admission = guard.admit(c)
        if (!admission.ok) return fail(admission.status, admission.message)
        return forward(body, provider, c.req.raw.signal, admission)
      },
    )
  }
  register('/providers/:provider/chat/completions', false, 2 * 1024 * 1024, 'conversation')
  register('/providers/:provider/vision/chat/completions', true, 12 * 1024 * 1024, 'image analysis')
  return app
}
