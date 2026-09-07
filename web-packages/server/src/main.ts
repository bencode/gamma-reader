import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3302)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const webRoot =
  process.env.NODE_ENV === 'production'
    ? fileURLToPath(new URL('../../../ui-packages/web/dist/', import.meta.url))
    : undefined

if (webRoot) {
  try {
    await access(`${webRoot}/index.html`)
  } catch (cause) {
    throw new Error('The frontend build is unavailable. Run pnpm build before pnpm start.', {
      cause,
    })
  }
}

const hostname = process.env.HOST ?? '127.0.0.1'
serve({ fetch: createApp(webRoot).fetch, port, hostname }, info => {
  console.info(`Gamma Reader: http://${hostname}:${info.port}`)
})
