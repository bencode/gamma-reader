import { type Api, createModels, type Model } from '@earendil-works/pi-ai'
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { ModelReference, PublicModelConfig } from '@gamma-reader/shared/model-config'
import { isUserProvider, registerUserProviders, userProviderPrefix } from '../../core/byok/runtime'
import { userProviders } from '../../core/byok/store'

export const models = createModels()
models.setProvider(zaiCodingCnProvider())
models.setProvider(deepseekProvider())

export const proxyRequestOptions = { maxRetries: 0, timeoutMs: 300_000 } as const

/**
 * Which credential a request carries. A model on the free allowance goes
 * through our proxy, which holds the real one; a model the reader configured
 * goes straight to the vendor with the key they supplied.
 */
export const apiKeyFor = (model: Model<Api>) => {
  if (!isUserProvider(model.provider)) return 'gamma-reader-proxy'
  const id = model.provider.slice(userProviderPrefix.length)
  return userProviders().find(provider => provider.id === id)?.apiKey ?? ''
}

export type ModelRuntime = {
  providers: readonly { id: string; name: string; models: readonly Model<Api>[] }[]
  defaultModel: ModelReference
  visionModel?: Model<Api>
  /** Vision models for providers the reader configured, keyed by provider id. */
  ownVisionModels: ReadonlyMap<string, Model<Api>>
}

/** The model that answers questions about images while this chat model is in use. */
export const visionModelFor = (runtime: ModelRuntime, chat: Model<Api>) =>
  isUserProvider(chat.provider) ? runtime.ownVisionModels.get(chat.provider) : runtime.visionModel

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

export const createModelRuntime = async (
  config: Extract<PublicModelConfig, { enabled: true }>,
): Promise<ModelRuntime> => {
  const free = config.providers.map(({ id, chatModels }) => {
    const provider = models.getProvider(id)
    if (!provider) throw new Error(`Unsupported pi provider: ${id}`)
    return {
      id,
      name: provider.name,
      models: chatModels.map(modelId => proxyModel({ provider: id, modelId })),
    }
  })
  const own = await registerUserProviders(models, userProviders())
  return {
    providers: [...free, ...own],
    defaultModel: config.defaultModel,
    visionModel: config.visionModel ? proxyModel(config.visionModel, true) : undefined,
    ownVisionModels: new Map(
      own.flatMap(provider => (provider.visionModel ? [[provider.id, provider.visionModel]] : [])),
    ),
  }
}
