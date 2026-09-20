import {
  type Api,
  createProvider,
  envApiKeyAuth,
  type Model,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { catalogEntry } from './catalog'
import type { UserProvider } from './store'

/**
 * A reader's own provider is registered separately from the same vendor on the
 * free allowance, so both can appear at once and a request carries the key
 * belonging to the one it was sent through.
 */
export const userProviderPrefix = 'user:'

export const userProviderId = (id: string) => `${userProviderPrefix}${id}`

export const isUserProvider = (provider: string) => provider.startsWith(userProviderPrefix)

/**
 * Re-registers a provider pi already implements under a second id, keeping its
 * address, catalog and stream behaviour. Models are restamped so the collection
 * routes them here, and restamped back on the way into the implementation.
 */
const aliased = (provider: Provider, id: string): Provider => ({
  ...provider,
  id,
  getModels: () => provider.getModels().map(model => ({ ...model, provider: id })),
  stream: (model, context, options) =>
    provider.stream({ ...model, provider: provider.id }, context, options),
  streamSimple: (model, context, options) =>
    provider.streamSimple({ ...model, provider: provider.id }, context, options),
})

const customModel = (id: string, provider: string, baseUrl: string): Model<Api> => ({
  id,
  name: id,
  api: 'openai-completions',
  provider,
  baseUrl,
  reasoning: false,
  // Nothing states what a reader's own endpoint can read, so images stay on the
  // table and the reader names the model that handles them.
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4_096,
})

const customProvider = (configured: UserProvider, id: string, baseUrl: string) =>
  createProvider({
    id,
    name: configured.label?.trim() || baseUrl,
    baseUrl,
    auth: { apiKey: envApiKeyAuth(configured.label?.trim() || id, []) },
    models: configured.models.map(model => customModel(model, id, baseUrl)),
    api: openAICompletionsApi(),
  })

export type RegisteredProvider = {
  id: string
  name: string
  models: readonly Model<Api>[]
  /** The model the reader named for images, when they named one. */
  visionModel?: Model<Api>
}

/**
 * Registers every configured provider and reports what each one offers. Only
 * the models a reader chose are reported, so a vendor with hundreds of them
 * does not flood the conversation's model list.
 */
export const registerUserProviders = async (
  models: MutableModels,
  configured: readonly UserProvider[],
): Promise<RegisteredProvider[]> => {
  const registered: RegisteredProvider[] = []
  for (const entry of configured) {
    const id = userProviderId(entry.id)
    const provider = entry.baseUrl
      ? customProvider(entry, id, entry.baseUrl)
      : aliased(await (catalogEntry(entry.id)?.load() ?? Promise.reject(unknown(entry.id))), id)
    models.setProvider(provider)
    const chosen = provider.getModels().filter(model => entry.models.includes(model.id))
    if (chosen.length === 0) continue
    registered.push({
      id,
      name: provider.name,
      models: chosen,
      visionModel: chosen.find(model => model.id === entry.visionModel),
    })
  }
  return registered
}

const unknown = (id: string) => new Error(`Unsupported model provider: ${id}`)
