import { createModels } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { customProviderKey } from './catalog'
import { registerUserProviders, userProviderId } from './runtime'
import { visionCandidates } from './vision-models'

const register = (configured: Parameters<typeof registerUserProviders>[1]) => {
  const models = createModels()
  return registerUserProviders(models, configured).then(providers => ({ models, providers }))
}

describe('registerUserProviders', () => {
  it("keeps a known vendor's own address, so its requests never reach our proxy", async () => {
    const { providers } = await register([
      { id: 'deepseek', apiKey: 'a-key', models: ['deepseek-v4-pro'] },
    ])

    const [model] = providers[0]?.models ?? []
    expect(model?.baseUrl).toBe('https://api.deepseek.com')
    expect(model?.baseUrl).not.toContain('/api/agent')
  })

  it("uses the reader's address for an endpoint they supplied", async () => {
    const { providers } = await register([
      {
        id: 'mine',
        apiKey: 'a-key',
        baseUrl: 'https://llm.example.com/v1',
        label: 'Mine',
        models: ['house-model'],
      },
    ])

    expect(providers[0]?.name).toBe('Mine')
    expect(providers[0]?.models[0]?.baseUrl).toBe('https://llm.example.com/v1')
  })

  it("reports only the models the reader chose, not the vendor's whole catalogue", async () => {
    const { providers } = await register([
      { id: 'deepseek', apiKey: 'a-key', models: ['deepseek-v4-pro'] },
    ])

    expect(providers[0]?.models.map(model => model.id)).toEqual(['deepseek-v4-pro'])
  })

  // The same vendor can be on the free allowance and on a reader's own key at
  // once; sharing one id would make the request unable to say which key it wants.
  it('registers under an id of its own so it cannot be confused with the free one', async () => {
    const { models, providers } = await register([
      { id: 'deepseek', apiKey: 'a-key', models: ['deepseek-v4-pro'] },
    ])

    expect(providers[0]?.id).toBe(userProviderId('deepseek'))
    expect(providers[0]?.id).not.toBe('deepseek')
    expect(models.getProvider('user:deepseek')).toBeDefined()
    expect(providers[0]?.models[0]?.provider).toBe('user:deepseek')
  })

  // Pointing a known vendor at a mirror is why the address is editable; losing
  // pi's catalogue in exchange would defeat it.
  it("keeps a known vendor's models when the reader points it elsewhere", async () => {
    const { providers } = await register([
      {
        id: 'deepseek',
        apiKey: 'a-key',
        baseUrl: 'https://mirror.example.com/v1',
        models: ['deepseek-v4-pro'],
      },
    ])

    expect(providers[0]?.models.map(model => model.id)).toEqual(['deepseek-v4-pro'])
    expect(providers[0]?.models[0]?.baseUrl).toBe('https://mirror.example.com/v1')
  })

  // A reader names their own endpoint freely, and nothing stops them naming it
  // after a vendor pi ships. Read back as that preset, it would be asked for
  // pi's catalogue and lose every model they actually chose.
  it("keeps an endpoint of the reader's own even when they named it after a vendor", async () => {
    const { providers } = await register([
      {
        id: customProviderKey('deepseek'),
        apiKey: 'a-key',
        baseUrl: 'https://llm.example.com/v1',
        label: 'deepseek',
        models: ['house-model'],
      },
    ])

    expect(providers[0]?.models.map(model => model.id)).toEqual(['house-model'])
    expect(providers[0]?.models[0]?.baseUrl).toBe('https://llm.example.com/v1')
  })

  it('skips a provider whose chosen models no longer exist', async () => {
    const { providers } = await register([
      { id: 'deepseek', apiKey: 'a-key', models: ['a-model-that-was-retired'] },
    ])

    expect(providers).toEqual([])
  })
})

describe('visionCandidates', () => {
  it('offers only the models that read images', async () => {
    const { providers } = await register([
      {
        id: 'deepseek',
        apiKey: 'a-key',
        models: ['deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
      },
    ])

    expect(visionCandidates(providers[0]?.models ?? []).map(model => model.id)).toEqual([
      'deepseek-v4-flash-vision-exp',
    ])
  })
})
