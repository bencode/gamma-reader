import { type Api, createModels, type Model } from '@earendil-works/pi-ai'
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { ModelReference, PublicModelConfig } from '@gamma-reader/shared/model-config'

export const models = createModels()
models.setProvider(zaiCodingCnProvider())
models.setProvider(deepseekProvider())

export const proxyRequestOptions = {
  apiKey: 'gamma-reader-proxy',
  maxRetries: 0,
  timeoutMs: 300_000,
} as const

export type ModelRuntime = {
  providers: readonly { id: string; name: string; models: readonly Model<Api>[] }[]
  defaultModel: ModelReference
  visionModel?: Model<Api>
}

const proxyModel = ({ provider, modelId }: ModelReference, vision = false): Model<Api> => {
  const model = models.getModel(provider, modelId)
  if (!model) throw new Error(`Unsupported pi model: ${provider}/${modelId}`)
  if (vision && !model.input.includes('image'))
    throw new Error(`The configured vision model cannot read images: ${provider}/${modelId}`)
  return {
    ...model,
    baseUrl: new URL(
      `/api/agent/providers/${encodeURIComponent(provider)}${vision ? '/vision' : ''}`,
      window.location.origin,
    ).href,
  }
}

export const createModelRuntime = (
  config: Extract<PublicModelConfig, { enabled: true }>,
): ModelRuntime => ({
  providers: config.providers.map(({ id, chatModels }) => {
    const provider = models.getProvider(id)
    if (!provider) throw new Error(`Unsupported pi provider: ${id}`)
    return {
      id,
      name: provider.name,
      models: chatModels.map(modelId => proxyModel({ provider: id, modelId })),
    }
  }),
  defaultModel: config.defaultModel,
  visionModel: config.visionModel ? proxyModel(config.visionModel, true) : undefined,
})
