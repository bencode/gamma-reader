import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ModelProxyConfig } from './model-proxy/config.js'
import { createModelProxyRoutes } from './model-proxy/routes.js'
import type { QuotaGuard } from './quota/guard.js'
import type { SourceConfig } from './source-config.js'

export const createApp = (
  guard: QuotaGuard,
  webRoot?: string,
  modelConfig: ModelProxyConfig = { providers: {}, publicConfig: { enabled: false } },
  source: SourceConfig | null = null,
) => {
  const app = new Hono()

  app.get('/api/health', c => c.json({ status: 'ok', service: 'gamma-reader' }))
  app.route('/api/agent', createModelProxyRoutes(modelConfig, guard))
  app.get('/api/source', c =>
    source ? c.json(source) : c.json({ error: 'No source is configured' }, 404),
  )
  app.all('/api', c => c.json({ error: 'Not found' }, 404))
  app.all('/api/*', c => c.json({ error: 'Not found' }, 404))

  if (webRoot) {
    app.get('/files', serveStatic({ root: webRoot, path: 'index.html' }))
    app.get('/files/:documentId', serveStatic({ root: webRoot, path: 'index.html' }))
    app.get('/p/:projectId', serveStatic({ root: webRoot, path: 'index.html' }))
    app.get('/p/:projectId/files', serveStatic({ root: webRoot, path: 'index.html' }))
    app.get('/p/:projectId/files/:documentId', serveStatic({ root: webRoot, path: 'index.html' }))
    app.use('*', serveStatic({ root: webRoot }))
  }

  app.onError((error, c) => {
    console.error('Request failed', error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
