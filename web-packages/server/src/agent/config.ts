import type { AgentConfig } from './contract.js'

export type AgentServerConfig = { apiKey: string; modelId: string; visionModelId: string }

export const readAgentConfig = (env: Record<string, string | undefined>): AgentServerConfig => ({
  apiKey: env.GLM_API_KEY?.trim() ?? '',
  modelId: env.GLM_MODEL?.trim() || 'glm-5.3',
  visionModelId: env.GLM_VISION_MODEL?.trim() || 'glm-5.3-flash',
})

export const publicAgentConfig = ({
  apiKey,
  modelId,
  visionModelId,
}: AgentServerConfig): AgentConfig =>
  apiKey ? { enabled: true, provider: 'zai-coding-cn', modelId, visionModelId } : { enabled: false }
