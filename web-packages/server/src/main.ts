import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { resolveModelProxyConfig } from './model-proxy/config.js'
import providers from './model-proxy/providers.json' with { type: 'json' }
import { readQuotaConfig } from './quota/config.js'
import { createQuotaGuard } from './quota/guard.js'
import { openQuotaStore } from './quota/store.js'
import { openRepository, type Source } from './source/repository.js'
import { openWorkingTree } from './source/working-tree.js'
import { readSourceConfig, type SourceConfig } from './source-config.js'
import { tavilySearch } from './web-search/provider.js'

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
const tavilyKey = process.env.TAVILY_API_KEY?.trim()
const search = tavilyKey
  ? tavilySearch(tavilyKey, process.env.GAMMA_SEARCH_PROXY?.trim() || undefined)
  : undefined
const models = resolveModelProxyConfig(providers, process.env)
// The reader sees the web search switch only where a search service is configured.
const config =
  search && models.publicConfig.enabled
    ? { ...models, publicConfig: { ...models.publicConfig, webSearch: true as const } }
    : models
const quota = readQuotaConfig(process.env)
const store = openQuotaStore(quota.databaseFile)
const guard = createQuotaGuard(store, quota)
// A remote source is only named; a repository is served from here.
const openSource = async (config: SourceConfig): Promise<Source | null> => {
  if (config.kind === 'remote') return null
  if (config.kind === 'worktree') return openWorkingTree(config)
  const repository = openRepository(config)
  await repository.update()
  // A failed pull keeps serving the last commit; the next one tries again.
  setInterval(() => {
    repository.update().catch(cause => console.error('Unable to update the source', cause))
  }, config.pullSeconds * 1000)
  return repository
}

const sourceConfig = readSourceConfig(process.env)
const source = sourceConfig ? { config: sourceConfig, files: await openSource(sourceConfig) } : null

serve({ fetch: createApp(guard, webRoot, config, source, search).fetch, port, hostname }, info => {
  console.info(`Gamma Reader: http://${hostname}:${info.port}`)
})
