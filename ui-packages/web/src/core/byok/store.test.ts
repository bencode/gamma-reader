import { afterEach, describe, expect, it, vi } from 'vitest'

const storageKey = 'gamma-reader.model-providers'
const valid = { id: 'deepseek', apiKey: 'a-key', models: ['deepseek-v4-pro'] }

const load = async () => {
  vi.resetModules()
  return import('./store')
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('configured model providers', () => {
  it('saves, replaces by id, and removes', async () => {
    const store = await load()
    store.saveUserProvider(valid)
    store.saveUserProvider({ ...valid, apiKey: 'a-newer-key' })

    expect(store.userProviders()).toEqual([{ ...valid, apiKey: 'a-newer-key' }])

    store.saveUserProvider({ id: 'openai', apiKey: 'another', models: ['gpt-5'] })
    expect(store.userProviders()).toHaveLength(2)

    store.removeUserProvider('deepseek')
    expect(store.userProviders().map(provider => provider.id)).toEqual(['openai'])
  })

  it('survives a reload', async () => {
    const first = await load()
    first.saveUserProvider(valid)

    expect((await load()).userProviders()).toEqual([valid])
  })

  it.each([
    ['not json at all', 'not json at all'],
    ['an object instead of a list', JSON.stringify({ deepseek: valid })],
    ['entries missing a key', JSON.stringify([{ id: 'deepseek', models: [] }])],
    ['entries whose models are not strings', JSON.stringify([{ ...valid, models: [1, 2] }])],
  ])('falls back rather than throwing when storage holds %s', async (_name, stored) => {
    localStorage.setItem(storageKey, stored)
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = await load()

    expect(store.userProviders()).toEqual([])
    if (!stored.startsWith('[') && !stored.startsWith('{')) expect(report).toHaveBeenCalled()
  })

  it('keeps the sound entries when only some are damaged', async () => {
    localStorage.setItem(storageKey, JSON.stringify([valid, { id: 'broken' }]))

    expect((await load()).userProviders()).toEqual([valid])
  })
})
