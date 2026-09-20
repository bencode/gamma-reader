import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ModelProxyConfig } from './config.js'

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
) => {
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
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      await response.body?.cancel()
      console.warn('Model request rejected', { status: response.status })
      return fail(response.status, `The model provider returned HTTP ${response.status}.`)
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel()
      console.warn('Model response was not an event stream')
      return fail(502, 'The model provider returned an invalid response.')
    }
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (cause) {
    if (client.aborted) return fail(499, 'The request was cancelled.')
    if (timeout.aborted) return fail(504, 'The model request timed out.')
    console.error('Model connection failed', {
      name: cause instanceof Error ? cause.name : 'UnknownError',
    })
    return fail(502, 'Could not connect to the model provider.')
  }
}

export const createModelProxyRoutes = (config: ModelProxyConfig) => {
  const app = new Hono()
  app.get('/config', c => {
    c.header('Cache-Control', 'no-store')
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
        return forward(body, provider, c.req.raw.signal)
      },
    )
  }
  register('/providers/:provider/chat/completions', false, 2 * 1024 * 1024, 'conversation')
  register('/providers/:provider/vision/chat/completions', true, 12 * 1024 * 1024, 'image analysis')
  return app
}
