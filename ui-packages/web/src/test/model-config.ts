import type { PublicModelConfig } from '@gamma-reader/shared/model-config'

export const modelConfig = {
  enabled: true,
  providers: [
    { id: 'zai-coding-cn', chatModels: ['glm-5.3', 'glm-5.2'] },
    { id: 'deepseek', chatModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  ],
  defaultModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3' },
  visionModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3-flash' },
} as const satisfies PublicModelConfig
