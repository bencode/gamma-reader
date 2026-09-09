import { Agent } from '@earendil-works/pi-agent-core'
import { createModels } from '@earendil-works/pi-ai'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { AgentConfig } from '@gamma-reader/server/agent-contract'
import type { LocalTools } from '../local-tools'
import { systemPrompt } from './system-prompt'
import { createReaderTools } from './tools'

export const createReaderAgent = (
  config: Extract<AgentConfig, { enabled: true }>,
  tools: LocalTools,
) => {
  const models = createModels()
  models.setProvider(zaiCodingCnProvider())
  const model = models.getModel(config.provider, config.modelId)
  if (!model) throw new Error(`Unsupported GLM model: ${config.modelId}`)
  return new Agent({
    toolExecution: 'sequential',
    initialState: {
      model: { ...model, baseUrl: new URL('/api/agent', window.location.origin).href },
      systemPrompt,
      thinkingLevel: 'low',
      tools: createReaderTools(tools),
    },
    streamFn: (currentModel, context, options) =>
      models.streamSimple(currentModel, context, {
        ...options,
        apiKey: 'gamma-reader-proxy',
        maxRetries: 0,
        timeoutMs: 300_000,
      }),
  })
}

export const loadAgentConfig = async (signal: AbortSignal): Promise<AgentConfig> => {
  const response = await fetch('/api/agent/config', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Could not connect to chat. Reload to try again.')
  const config: unknown = await response.json()
  if (typeof config === 'object' && config !== null && 'enabled' in config) {
    if (config.enabled === false) return { enabled: false }
    if (
      config.enabled === true &&
      'provider' in config &&
      config.provider === 'zai-coding-cn' &&
      'modelId' in config &&
      typeof config.modelId === 'string'
    )
      return { enabled: true, provider: config.provider, modelId: config.modelId }
  }
  throw new Error('The chat configuration is invalid.')
}
