import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { ModelProxyConfig } from './model-proxy/config.js'
import { createModelProxyRoutes } from './model-proxy/routes.js'
import type { QuotaGuard } from './quota/guard.js'
import type { Source } from './source/repository.js'
import { createRoutes as createSourceRoutes } from './source/routes.js'
import {
  projectRoute,
  type SourceConfig,
  type SourceProject,
  sourceLocations,
  tutorialPath,
} from './source-config.js'
import { createWebRoutes, type WebServices } from './web-search/routes.js'

export const createApp = (
  guard: QuotaGuard,
  webRoot?: string,
  modelConfig: ModelProxyConfig = { providers: {}, publicConfig: { enabled: false } },
  // The source the library syncs from, and the files of each of its projects this server serves.
  source: {
    config: SourceConfig
    served: readonly { project: SourceProject; files: Source }[]
  } | null = null,
  web?: WebServices,
  // The tutorial shipped with this deployment, which every reader's Tutorial project syncs from.
  tutorial?: Source,
) => {
  const app = new Hono()

  app.get('/api/health', c => c.json({ status: 'ok', service: 'gamma-reader' }))
  app.route('/api/agent', createModelProxyRoutes(modelConfig, guard))
  app.route('/api/agent', createWebRoutes(web, guard))
  app.get('/api/sources', c => c.json(source ? sourceLocations(source.config) : []))
  for (const { project, files } of source?.served ?? [])
    app.route(projectRoute(project), createSourceRoutes(files))
  if (tutorial) app.route(tutorialPath, createSourceRoutes(tutorial))
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
