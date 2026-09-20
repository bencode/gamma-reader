import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/**
 * A provider the reader brought their own key for. Requests to it go straight
 * from the browser to the vendor, so the key is never sent anywhere else.
 */
export type UserProvider = {
  /** Catalog entry id for a preset, or a reader-chosen id for a custom endpoint. */
  id: string
  apiKey: string
  /** Model ids the reader chose to see in the conversation's model list. */
  models: string[]
  /** One of `models` that accepts images, when the reader designated one. */
  visionModel?: string
  /** Custom endpoints only; presets take their address from pi. */
  baseUrl?: string
  /** Custom endpoints only; presets take their name from pi. */
  label?: string
}

// Keys live in localStorage rather than IndexedDB on purpose. Code Lab runs a
// reader's TypeScript cells through `new Function` inside a same-origin module
// worker, which can reach `indexedDB` and `fetch` — a lab file downloaded from
// anywhere could read a key there and send it away. `localStorage` does not
// exist in worker scope. Do not "tidy" this into the workspace database.
const storageKey = 'gamma-reader.model-providers'

const isProvider = (value: unknown): value is UserProvider =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  value.id !== '' &&
  'apiKey' in value &&
  typeof value.apiKey === 'string' &&
  'models' in value &&
  Array.isArray(value.models) &&
  value.models.every(model => typeof model === 'string')

const readProviders = (): UserProvider[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored.filter(isProvider) : []
  } catch (error) {
    console.error('Unable to read configured model providers', error)
    return []
  }
}

const writeProviders = (providers: readonly UserProvider[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(providers))
  } catch (error) {
    console.error('Unable to save configured model providers', error)
  }
}

type ProviderState = {
  providers: UserProvider[]
  save: (provider: UserProvider) => void
  remove: (id: string) => void
}

const providerStore = createStore<ProviderState>((set, get) => ({
  providers: readProviders(),
  save: provider => {
    const others = get().providers.filter(existing => existing.id !== provider.id)
    const providers = [...others, provider]
    writeProviders(providers)
    set({ providers })
  },
  remove: id => {
    const providers = get().providers.filter(existing => existing.id !== id)
    writeProviders(providers)
    set({ providers })
  },
}))

export const useUserProviders = () => useStore(providerStore, state => state.providers)
export const userProviders = () => providerStore.getState().providers
export const saveUserProvider = (provider: UserProvider) => providerStore.getState().save(provider)
export const removeUserProvider = (id: string) => providerStore.getState().remove(id)
