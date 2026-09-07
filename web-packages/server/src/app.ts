import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

export const createApp = (webRoot?: string) => {
  const app = new Hono()

  app.get('/api/health', c => c.json({ status: 'ok', service: 'gamma-reader' }))
  app.all('/api', c => c.json({ error: 'Not found' }, 404))
  app.all('/api/*', c => c.json({ error: 'Not found' }, 404))

  if (webRoot) app.use('*', serveStatic({ root: webRoot }))

  app.onError((error, c) => {
    console.error('Request failed', error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
