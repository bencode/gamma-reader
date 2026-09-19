import type { AgentModelConfig } from './contract.js'

const providers: Record<'zai-coding-cn', readonly AgentModelConfig[]> = {
  'zai-coding-cn': [
    { id: 'glm-5.3', label: 'GLM-5.3', efforts: ['low', 'high', 'max'], defaultEffort: 'low' },
    { id: 'glm-5.2', label: 'GLM-5.2', efforts: ['off', 'high', 'max'], defaultEffort: 'high' },
  ],
}

export const configuredModels = (defaultModelId: string): readonly AgentModelConfig[] => {
  const models = providers['zai-coding-cn']
  if (models.some(model => model.id === defaultModelId)) return models
  return [
    { id: defaultModelId, label: defaultModelId, efforts: [], defaultEffort: 'low' },
    ...models,
  ]
}
