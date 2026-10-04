import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ModelProxyConfig } from './model-proxy/config.js'
import { createModelProxyRoutes } from './model-proxy/routes.js'
import type { QuotaGuard } from './quota/guard.js'
import type { Source } from './source/repository.js'
import { createRoutes as createSourceRoutes } from './source/routes.js'
import { libraryPath, type SourceConfig, sourceLocation } from './source-config.js'

export const createApp = (
  guard: QuotaGuard,
  webRoot?: string,
  modelConfig: ModelProxyConfig = { providers: {}, publicConfig: { enabled: false } },
  // The source the library syncs from, and its files when this server serves them itself.
  source: { config: SourceConfig; files: Source | null } | null = null,
) => {
  const app = new Hono()

  app.get('/api/health', c => c.json({ status: 'ok', service: 'gamma-reader' }))
  app.route('/api/agent', createModelProxyRoutes(modelConfig, guard))
  app.get('/api/source', c =>
    source
      ? c.json(sourceLocation(source.config))
      : c.json({ error: 'No source is configured' }, 404),
  )
  if (source?.files) app.route(libraryPath, createSourceRoutes(source.files))
  app.all('/api', c => c.json({ error: 'Not found' }, 404))
  app.all('/api/*', c => c.json({ error: 'Not found' }, 404))

  if (webRoot) {
    // The routes the application handles itself; a file route holds its whole path, folders too.
    const entry = serveStatic({ root: webRoot, path: 'index.html' })
    app.get('/files', entry)
    app.get('/files/*', entry)
    app.get('/pages/:name', entry)
    app.get('/p/:projectId', entry)
    app.get('/p/:projectId/files', entry)
    app.get('/p/:projectId/files/*', entry)
    app.get('/p/:projectId/pages/:name', entry)
    app.use('*', serveStatic({ root: webRoot }))
  }

  app.onError((error, c) => {
    console.error('Request failed', error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
