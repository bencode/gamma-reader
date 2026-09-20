export type ModelReference = {
  provider: string
  modelId: string
}

export type PublicModelConfig =
  | { enabled: false }
  | {
      enabled: true
      providers: readonly {
        id: string
        chatModels: readonly string[]
      }[]
      defaultModel: ModelReference
      visionModel?: ModelReference
    }
