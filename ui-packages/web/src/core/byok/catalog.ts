import type { Provider } from '@earendil-works/pi-ai'

/**
 * Providers a reader can bring a key for. pi already knows each one's address,
 * model list, and which of those models read images, so an entry carries only
 * the factory — duplicating any of that here would leave two versions to keep
 * in step.
 */
export type CatalogEntry = { id: string; load: () => Promise<Provider> }

const entry = (id: string, load: () => Promise<{ [key: string]: unknown }>): CatalogEntry => ({
  id,
  load: async () => {
    const module = await load()
    const factory = Object.values(module).find(value => typeof value === 'function')
    if (typeof factory !== 'function') throw new Error(`Unsupported pi provider: ${id}`)
    return factory() as Provider
  },
})

export const catalog: readonly CatalogEntry[] = [
  entry('deepseek', () => import('@earendil-works/pi-ai/providers/deepseek')),
  entry('zai-coding-cn', () => import('@earendil-works/pi-ai/providers/zai-coding-cn')),
  entry('moonshotai-cn', () => import('@earendil-works/pi-ai/providers/moonshotai-cn')),
  entry('openai', () => import('@earendil-works/pi-ai/providers/openai')),
  entry('openrouter', () => import('@earendil-works/pi-ai/providers/openrouter')),
  entry('xai', () => import('@earendil-works/pi-ai/providers/xai')),
  entry('groq', () => import('@earendil-works/pi-ai/providers/groq')),
  entry('mistral', () => import('@earendil-works/pi-ai/providers/mistral')),
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
