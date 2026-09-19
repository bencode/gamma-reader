export type AgentEffort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgentModelConfig = {
  id: string
  label: string
  efforts: readonly AgentEffort[]
  defaultEffort: AgentEffort
}

export type AgentSelection = { modelId: string; effort: AgentEffort }

export type AgentConfig =
  | { enabled: false }
  | {
      enabled: true
      provider: 'zai-coding-cn'
      modelId: string
      models: readonly AgentModelConfig[]
      visionModelId?: string
    }
