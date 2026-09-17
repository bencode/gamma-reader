import { Agent, type AgentMessage, type AgentState } from '@earendil-works/pi-agent-core'
import { createModels } from '@earendil-works/pi-ai'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { AgentConfig } from '@gamma-reader/server/agent-contract'

export const createAgent = (
  config: Extract<AgentConfig, { enabled: true }>,
  options: { tools: AgentState['tools']; systemPrompt: string },
  session: { id: string; messages: readonly AgentMessage[] },
) => {
  const models = createModels()
  models.setProvider(zaiCodingCnProvider())
  const model = models.getModel(config.provider, config.modelId)
  if (!model) throw new Error(`Unsupported GLM model: ${config.modelId}`)
  return new Agent({
    sessionId: session.id,
    toolExecution: 'sequential',
    initialState: {
      model: { ...model, baseUrl: new URL('/api/agent', window.location.origin).href },
      systemPrompt: options.systemPrompt,
      thinkingLevel: 'low',
      tools: options.tools,
      messages: [...session.messages],
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
    const visionModelId = 'visionModelId' in config ? config.visionModelId : undefined
    if (
      config.enabled === true &&
      'provider' in config &&
      config.provider === 'zai-coding-cn' &&
      'modelId' in config &&
      typeof config.modelId === 'string' &&
      (visionModelId === undefined || typeof visionModelId === 'string')
    )
      return {
        enabled: true,
        provider: config.provider,
        modelId: config.modelId,
        ...(typeof visionModelId === 'string' ? { visionModelId } : {}),
      }
  }
  throw new Error('The chat configuration is invalid.')
}
