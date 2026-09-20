import type { Provider } from '@earendil-works/pi-ai'

/**
 * Providers a reader can bring a key for. pi already knows each one's address,
 * model list, and which of those models read images, so an entry carries only
 * the factory — duplicating any of that here would leave two versions to keep
 * in step.
 */
export type CatalogEntry = { id: string; load: () => Promise<Provider> }

export const catalog: readonly CatalogEntry[] = [
  {
    id: 'deepseek',
    load: () =>
      import('@earendil-works/pi-ai/providers/deepseek').then(module => module.deepseekProvider()),
  },
  {
    id: 'zai-coding-cn',
    load: () =>
      import('@earendil-works/pi-ai/providers/zai-coding-cn').then(module =>
        module.zaiCodingCnProvider(),
      ),
  },
  {
    id: 'moonshotai-cn',
    load: () =>
      import('@earendil-works/pi-ai/providers/moonshotai-cn').then(module =>
        module.moonshotaiCnProvider(),
      ),
  },
  {
    id: 'openai',
    load: () =>
      import('@earendil-works/pi-ai/providers/openai').then(module => module.openaiProvider()),
  },
  {
    id: 'openrouter',
    load: () =>
      import('@earendil-works/pi-ai/providers/openrouter').then(module =>
        module.openrouterProvider(),
      ),
  },
  {
    id: 'xai',
    load: () => import('@earendil-works/pi-ai/providers/xai').then(module => module.xaiProvider()),
  },
  {
    id: 'groq',
    load: () =>
      import('@earendil-works/pi-ai/providers/groq').then(module => module.groqProvider()),
  },
  {
    id: 'mistral',
    load: () =>
      import('@earendil-works/pi-ai/providers/mistral').then(module => module.mistralProvider()),
  },
]

/** Marks a reader-supplied endpoint, which carries its own address and models. */
export const customProviderId = 'custom'

/**
 * Namespaces the name a reader gave their own endpoint. Storing it bare would
 * let one called "deepseek" overwrite the preset of that name and then be read
 * back as the preset, against pi's catalogue instead of its own models.
 */
export const customProviderKey = (name: string) => `${customProviderId}:${name}`

export const catalogEntry = (id: string) => catalog.find(candidate => candidate.id === id)
