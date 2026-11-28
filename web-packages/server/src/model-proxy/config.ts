import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'
import { zaiCodingCnProvider } from '@earendil-works/pi-ai/providers/zai-coding-cn'
import type { PublicModelConfig } from '@gamma-reader/shared/model-config'
import { z } from 'zod'

const nativeProviders = new Map(
  [zaiCodingCnProvider(), deepseekProvider()].map(provider => [provider.id, provider]),
)
const modelReference = z.strictObject({
  provider: z.string().min(1),
  modelId: z.string().min(1),
})
const configSchema = z.strictObject({
  providers: z.record(
    z.string().min(1),
    z.strictObject({
      apiKeyEnv: z.string().min(1),
      chatModels: z.array(z.string().min(1)).min(1),
    }),
  ),
  defaultModel: modelReference,
  visionModel: modelReference.optional(),
})

export type ModelProxyConfig = {
  publicConfig: PublicModelConfig
  providers: Readonly<
    Record<string, { baseUrl: string; apiKey: string; chatModels: readonly string[] }>
  >
}

export const resolveModelProxyConfig = (
  source: unknown,
  env: Record<string, string | undefined>,
): ModelProxyConfig => {
  const config = configSchema.parse(source)
  const providers = Object.fromEntries(
    Object.entries(config.providers).map(([id, settings]) => {
      const provider = nativeProviders.get(id)
      if (!provider?.baseUrl) throw new Error(`providers.${id}: unsupported pi provider`)
      const unknown = settings.chatModels.find(
        modelId => !provider.getModels().some(model => model.id === modelId),
      )
      if (unknown) throw new Error(`providers.${id}.chatModels: unknown pi model ${unknown}`)
      if (new Set(settings.chatModels).size !== settings.chatModels.length)
        throw new Error(`providers.${id}.chatModels: duplicate model`)
      return [
        id,
        {
          baseUrl: provider.baseUrl,
          apiKey: env[settings.apiKeyEnv]?.trim() ?? '',
          chatModels: settings.chatModels,
        },
      ] as const
    }),
  )
  const { defaultModel, visionModel } = config
  if (!providers[defaultModel.provider]?.chatModels?.includes(defaultModel.modelId))
    throw new Error('defaultModel: must reference an enabled chat model')
  if (visionModel) {
    const model = nativeProviders
      .get(visionModel.provider)
      ?.getModels()
      .find(candidate => candidate.id === visionModel.modelId)
    if (!providers[visionModel.provider] || !model?.input.includes('image'))
      throw new Error('visionModel: must reference a configured pi provider and image model')
  }
  const available = Object.entries(providers).flatMap(([id, provider]) =>
    provider.apiKey ? [{ id, chatModels: provider.chatModels }] : [],
  )
  const first = available[0]
  const firstModel = first?.chatModels[0]
  if (!first || !firstModel) return { providers, publicConfig: { enabled: false } }
  return {
    providers,
    publicConfig: {
      enabled: true,
      providers: available,
      defaultModel: providers[defaultModel.provider]?.apiKey
        ? defaultModel
        : { provider: first.id, modelId: firstModel },
      ...(visionModel && providers[visionModel.provider]?.apiKey ? { visionModel } : {}),
    },
  }
}
