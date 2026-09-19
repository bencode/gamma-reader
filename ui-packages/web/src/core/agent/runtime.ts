import { Agent, type AgentMessage, type AgentState } from '@earendil-works/pi-agent-core'
import { createModels } from '@earendil-works/pi-ai'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { AgentConfig, AgentSelection } from '@gamma-reader/server/agent-contract'
import { isModelConfig, resolveAgentSelection } from './model-settings'

const models = createModels()
models.setProvider(zaiCodingCnProvider())

export const agentModelState = (
  config: Extract<AgentConfig, { enabled: true }>,
  requested?: AgentSelection,
) => {
  const selection = resolveAgentSelection(config, requested)
  const model = models.getModel(config.provider, selection.modelId)
  if (!model) throw new Error(`Unsupported GLM model: ${selection.modelId}`)
  return {
    model: { ...model, baseUrl: new URL('/api/agent', window.location.origin).href },
    thinkingLevel: selection.effort,
  }
}

export const createAgent = (
  config: Extract<AgentConfig, { enabled: true }>,
  options: { tools: AgentState['tools']; systemPrompt: string },
  session: { id: string; messages: readonly AgentMessage[]; selection?: AgentSelection },
) =>
  new Agent({
    sessionId: session.id,
    toolExecution: 'sequential',
    initialState: {
      ...agentModelState(config, session.selection),
      systemPrompt: options.systemPrompt,
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
      'models' in config &&
      Array.isArray(config.models) &&
      config.models.every(isModelConfig) &&
      config.models.some(model => model.id === config.modelId) &&
      (visionModelId === undefined || typeof visionModelId === 'string')
    )
      return {
        enabled: true,
        provider: config.provider,
        modelId: config.modelId,
        models: config.models,
        ...(typeof visionModelId === 'string' ? { visionModelId } : {}),
      }
  }
  throw new Error('The chat configuration is invalid.')
}
