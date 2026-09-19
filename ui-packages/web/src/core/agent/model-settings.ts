import type {
  AgentConfig,
  AgentEffort,
  AgentModelConfig,
  AgentSelection,
} from '@gamma-reader/server/agent-contract'

export const resolveAgentSelection = (
  config: Extract<AgentConfig, { enabled: true }>,
  selection?: AgentSelection,
): AgentSelection => {
  const model =
    config.models.find(candidate => candidate.id === selection?.modelId) ??
    config.models.find(candidate => candidate.id === config.modelId)
  if (!model) throw new Error('The default chat model is unavailable.')
  return {
    modelId: model.id,
    effort:
      selection && model.efforts.includes(selection.effort)
        ? selection.effort
        : model.defaultEffort,
  }
}

const isEffort = (value: unknown): value is AgentEffort =>
  value === 'off' ||
  value === 'minimal' ||
  value === 'low' ||
  value === 'medium' ||
  value === 'high' ||
  value === 'xhigh' ||
  value === 'max'

export const isModelConfig = (value: unknown): value is AgentModelConfig => {
  if (typeof value !== 'object' || value === null) return false
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'label' in value &&
    typeof value.label === 'string' &&
    'efforts' in value &&
    Array.isArray(value.efforts) &&
    value.efforts.every(isEffort) &&
    'defaultEffort' in value &&
    isEffort(value.defaultEffort) &&
    (value.efforts.length === 0 || value.efforts.includes(value.defaultEffort))
  )
}
