import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { resolveModelProxyConfig } from './model-proxy/config.js'
import providers from './model-proxy/providers.json' with { type: 'json' }
import { readQuotaConfig } from './quota/config.js'
import { createQuotaGuard } from './quota/guard.js'
import { openQuotaStore } from './quota/store.js'
import { openDirectory } from './source/directory.js'
import { publishing } from './source/publish.js'
import { openClone, openCommitted, type Source } from './source/repository.js'
import { openWorkingTree } from './source/working-tree.js'
import { readSourceConfig, type SourceConfig, type SourceProject } from './source-config.js'
import { tavilyExtract, tavilySearch } from './web-search/provider.js'

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
const searchProxy = process.env.GAMMA_SEARCH_PROXY?.trim() || undefined
const web = tavilyKey
  ? {
      search: tavilySearch(tavilyKey, searchProxy),
      extract: tavilyExtract(tavilyKey, searchProxy),
    }
  : undefined
// A plugin app this deployment trusts: its tool descriptions reach the model as they are.
const pluginsUrl = process.env.GAMMA_PLUGINS_URL?.trim()
if (pluginsUrl && !/^https?:$/.test(URL.parse(pluginsUrl)?.protocol ?? '')) {
  throw new Error('GAMMA_PLUGINS_URL must be an http or https URL')
}
const plugins = pluginsUrl?.replace(/\/+$/, '')
const models = resolveModelProxyConfig(providers, process.env)
// The reader sees the web search switch only where a search service is configured, and plugins
// only where a plugin app is named.
const config = models.publicConfig.enabled
  ? {
      ...models,
      publicConfig: {
        ...models.publicConfig,
        ...(web && { webSearch: true as const }),
        ...(plugins && { plugins }),
      },
    }
  : models
const quota = readQuotaConfig(process.env)
const store = openQuotaStore(quota.databaseFile)
const guard = createQuotaGuard(store, quota)
// Each folder named as a project must be in the repository, in a clone once it is pulled.
const requireFolders = (dir: string, repository: string, projects: readonly SourceProject[]) =>
  Promise.all(
    projects
      .filter(({ folder }) => folder)
      .map(({ folder }) =>
        access(join(dir, folder)).catch((cause: unknown) => {
          throw new Error(`${repository} has no folder ${folder}`, { cause })
        }),
      ),
  )

// A remote source is only named; a repository is served from here, each project from its folder.
// A clone is pulled once for all of them.
const openSources = async (
  config: SourceConfig,
): Promise<{ project: SourceProject; files: Source }[]> => {
  if (config.kind === 'remote') return []
  const { include, exclude } = config
  const scope = { include, exclude }
  if (config.kind === 'worktree') {
    await requireFolders(config.dir, config.dir, config.projects)
    return Promise.all(
      config.projects.map(async project => ({
        project,
        files: await openWorkingTree({ dir: join(config.dir, project.folder), ...scope }),
      })),
    )
  }
  const clone = openClone(config)
  const published = config.push ? publishing(clone, config.dir) : null
  const repository = published ?? clone
  await repository.update()
  await requireFolders(config.dir, config.repo, config.projects)
  // A failed pull keeps serving the last commit; the next one tries again.
  setInterval(() => {
    repository.update().catch(cause => console.error('Unable to update the source', cause))
  }, config.pullSeconds * 1000)
  return config.projects.map(project => {
    const files = openCommitted({ dir: join(config.dir, project.folder), ...scope })
    return {
      project,
      files: published ? { ...files, save: published.saveIn(project.folder, scope) } : files,
    }
  })
}

// The tutorial sits at the repository root, beside the packages, in a checkout and in the image.
const tutorialDir =
  process.env.GAMMA_TUTORIAL_DIR?.trim() ||
  fileURLToPath(new URL('../../../tutorial/', import.meta.url))
await access(tutorialDir).catch((cause: unknown) => {
  throw new Error(`The tutorial folder ${tutorialDir} is unavailable.`, { cause })
})
const tutorial = openDirectory(tutorialDir)

const sourceConfig = readSourceConfig(process.env)
const source = sourceConfig
  ? { config: sourceConfig, served: await openSources(sourceConfig) }
  : null

serve(
  { fetch: createApp(guard, webRoot, config, source, web, tutorial).fetch, port, hostname },
  info => {
    console.info(`Gamma Reader: http://${hostname}:${info.port}`)
  },
)
