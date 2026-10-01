import type { PublicModelConfig } from '@gamma-reader/shared/model-config'
import { titlePrompt } from '../features/agent/conversation-title'

export const modelConfig = {
  enabled: true,
  providers: [
    { id: 'zai-coding-cn', chatModels: ['glm-5.3', 'glm-5.2'] },
    { id: 'deepseek', chatModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  ],
  defaultModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3' },
  visionModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3-flash' },
} as const satisfies PublicModelConfig

// After a reply finishes, the reader asks the model to name the conversation in a request of its
// own; a test about something else can answer it apart from the exchange it is counting.
export const isTitleRequest = (init?: RequestInit) =>
  String(init?.body).includes(titlePrompt.slice(0, 40))
