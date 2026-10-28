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
      // Present only where the server is configured to search the web.
      webSearch?: true
      // The plugin app's address, present only where the deployment names one.
      plugins?: string
    }
