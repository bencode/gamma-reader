import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { TSchema } from '@earendil-works/pi-ai'
import { bind, LocalToolError } from '../../core/agent/tool'
import { refusal } from '../assistant/web-tools'
import type { ManifestPlugin, ManifestTool } from './protocol'

// A connected plugin, its tools ready for the agent.
export type ReaderPlugin = Omit<ManifestPlugin, 'tools'> & { tools: AgentTool[] }

// Asks the plugin app which plugins this browser has connected. The app knows the user by its own
// cookie, which the browser sends because the two share a site.
export const loadPlugins = async (base: string, signal: AbortSignal): Promise<ReaderPlugin[]> => {
  const response = await fetch(`${base}/manifest`, { credentials: 'include', signal })
  if (!response.ok) throw new Error(`The plugin app answered ${response.status}.`)
  return readManifest(await response.json()).map(plugin => ({
    ...plugin,
    tools: plugin.tools.map(tool => pluginTool(base, plugin.name, tool)),
  }))
}

const pluginTools = new WeakSet<AgentTool>()

// The agent's tools with those of the plugins this conversation turned on, as far as they are
// still connected; the plugin tools it had before go.
export const withPlugins = (
  tools: readonly AgentTool[],
  available: readonly ReaderPlugin[],
  on: readonly string[],
): AgentTool[] => [
  ...tools.filter(tool => !pluginTools.has(tool)),
  ...available.filter(plugin => on.includes(plugin.name)).flatMap(plugin => plugin.tools),
]

// A plugin or tool that does not fit the protocol is left out, so a faulty app cannot shadow the
// reader's own tools or hand the model a schema it cannot use.
export const readManifest = (value: unknown): ManifestPlugin[] => {
  const plugins = isRecord(value) && Array.isArray(value.plugins) ? value.plugins : []
  return plugins.flatMap(item => {
    const plugin = readPlugin(item)
    if (!plugin) console.error('A plugin does not fit the manifest protocol', item)
    return plugin ? [plugin] : []
  })
}

const readPlugin = (value: unknown): ManifestPlugin | null => {
  if (!isRecord(value)) return null
  const { name, title, icon, tools } = value
  if (
    typeof name !== 'string' ||
    !/^[a-z][a-z0-9-]*$/.test(name) ||
    typeof title !== 'string' ||
    typeof icon !== 'string' ||
    !/^https?:$/.test(URL.parse(icon)?.protocol ?? '') ||
    !Array.isArray(tools)
  )
    return null
  return {
    name,
    title,
    icon,
    tools: tools.flatMap(item => {
      const tool = readTool(name, item)
      if (!tool) console.error(`A tool of ${name} does not fit the manifest protocol`, item)
      return tool ? [tool] : []
    }),
  }
}

const readTool = (plugin: string, value: unknown): ManifestTool | null => {
  if (!isRecord(value)) return null
  const { name, description, parameters } = value
  if (
    typeof name !== 'string' ||
    !name.startsWith(`${plugin}_`) ||
    typeof description !== 'string' ||
    !isRecord(parameters) ||
    parameters.type !== 'object'
  )
    return null
  return { name, description, parameters }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const pluginTool = (base: string, plugin: string, tool: ManifestTool) => {
  // pi-ai validates arguments against a plain JSON Schema as well as a TypeBox one.
  const parameters = tool.parameters as TSchema
  const call = bind(tool.name, tool.description, parameters, async (input, signal) => {
    const response = await fetch(`${base}/${plugin}/tools/${tool.name}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
    if (!response.ok) {
      throw new LocalToolError(await refusal(response, `The ${plugin} plugin failed.`))
    }
    return response.json()
  })
  pluginTools.add(call)
  return call
}
