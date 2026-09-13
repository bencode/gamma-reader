import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { type AgentServerConfig, readAgentConfig } from './agent/config.js'
import { createAgentRoutes } from './agent/proxy.js'

export const createApp = (
  webRoot?: string,
  agentConfig: AgentServerConfig = readAgentConfig({}),
) => {
  const app = new Hono()

  app.get('/api/health', c => c.json({ status: 'ok', service: 'gamma-reader' }))
  app.route('/api/agent', createAgentRoutes(agentConfig))
  app.all('/api', c => c.json({ error: 'Not found' }, 404))
  app.all('/api/*', c => c.json({ error: 'Not found' }, 404))

  if (webRoot) {
    app.get('/files', serveStatic({ root: webRoot, path: 'index.html' }))
    app.get('/files/:documentId', serveStatic({ root: webRoot, path: 'index.html' }))
    app.use('*', serveStatic({ root: webRoot }))
  }

  app.onError((error, c) => {
    console.error('Request failed', error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
