import type { AgentState } from '@earendil-works/pi-agent-core'
import { clampThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelSelection } from '../../core/conversations'
import type { ModelRuntime } from '../agent/model-runtime'

export const resolveModelSelection = (
  runtime: ModelRuntime,
  requested?: ModelSelection,
): Pick<AgentState, 'model' | 'thinkingLevel'> => {
  const available = runtime.providers.flatMap(provider => provider.models)
  const model =
    available.find(
      candidate =>
        requested !== undefined &&
        candidate.provider === requested.provider &&
        candidate.id === requested.modelId,
    ) ??
    available.find(
      candidate =>
        candidate.provider === runtime.defaultModel.provider &&
        candidate.id === runtime.defaultModel.modelId,
    )
  if (!model) throw new Error('The default chat model is unavailable.')
  return { model, thinkingLevel: clampThinkingLevel(model, requested?.effort ?? 'off') }
}
