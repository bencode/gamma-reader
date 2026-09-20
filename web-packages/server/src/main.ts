import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { resolveModelProxyConfig } from './model-proxy/config.js'
import providers from './model-proxy/providers.json' with { type: 'json' }
import { createQuotaGuard, readQuotaConfig } from './quota/guard.js'
import { openQuotaStore, retentionCutoff } from './quota/store.js'

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
const config = resolveModelProxyConfig(providers, process.env)
const quota = readQuotaConfig(process.env)
const store = openQuotaStore(quota.databaseFile)
store.prune(retentionCutoff(Date.now(), 7))
const guard = createQuotaGuard(store, quota)

serve({ fetch: createApp(guard, webRoot, config).fetch, port, hostname }, info => {
  console.info(`Gamma Reader: http://${hostname}:${info.port}`)
})
