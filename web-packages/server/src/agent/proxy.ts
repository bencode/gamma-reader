import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  type AgentServerConfig,
  type GuardConfig,
  publicAgentConfig,
  readGuardConfig,
} from './config.js'
import { createOriginGuard } from './origin.js'
import { clientIp, createTokenGuard, estimateTokens } from './rate-limit.js'

const endpoint = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions'
const fail = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json(
    { error: { message } },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )

const validBody = (body: unknown, modelId: string): body is Record<string, unknown> =>
  typeof body === 'object' &&
  body !== null &&
  'model' in body &&
  body.model === modelId &&
  'messages' in body &&
  Array.isArray(body.messages) &&
  'stream' in body &&
  body.stream === true

const forward = async (
  body: Record<string, unknown>,
  config: AgentServerConfig,
  client: AbortSignal,
) => {
  const timeout = AbortSignal.timeout(300_000)
  try {
    const response = await fetch(endpoint, {
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

export const createAgentRoutes = (
  config: AgentServerConfig,
  guardConfig: GuardConfig = readGuardConfig(process.env),
) => {
  const app = new Hono()
  app.use('*', createOriginGuard(guardConfig))
  const guard = createTokenGuard(guardConfig)
  app.get('/config', c => {
    c.header('Cache-Control', 'no-store')
    return c.json(publicAgentConfig(config))
  })
  const register = (path: string, modelId: string, maximumBytes: number, label: string) => {
    app.post(
      path,
      bodyLimit({
        maxSize: maximumBytes,
        onError: () => fail(413, `The ${label} exceeds the request limit.`),
      }),
      async c => {
        if (!config.apiKey) return fail(503, 'Chat is currently unavailable.')
        if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/json')
          return fail(400, 'Use application/json.')
        let body: unknown
        try {
          body = await c.req.json()
        } catch (cause) {
          if (!(cause instanceof SyntaxError)) throw cause
          return fail(400, 'The request is not valid JSON.')
        }
        if (!validBody(body, modelId))
          return fail(400, 'Use the configured model, messages and stream: true.')
        const ip = clientIp(c, guardConfig.trustProxy)
        const tokens = estimateTokens(body)
        if (guardConfig.rateLimiting) {
          const verdict = guard.check(ip, tokens)
          if (!verdict.allowed) {
            return fail(
              verdict.status,
              verdict.message,
              verdict.retryAfterSeconds
                ? { 'Retry-After': String(verdict.retryAfterSeconds) }
                : {},
            )
          }
        }
        console.info('Agent request accepted', { ip, model: modelId, estimatedTokens: tokens })
        return forward(body, config, c.req.raw.signal)
      },
    )
  }
  register('/chat/completions', config.modelId, 2 * 1024 * 1024, 'conversation')
  register('/vision/chat/completions', config.visionModelId, 12 * 1024 * 1024, 'image analysis')
  return app
}
