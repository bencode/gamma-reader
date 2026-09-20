import { createModels } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { customProviderKey } from './catalog'
import { registerUserProviders, userProviderId } from './runtime'

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

  // One runtime carries the free models and the reader's own, so a stored
  // entry nothing can build must not be allowed to take the others down.
  it('skips an entry it can no longer build rather than refusing them all', async () => {
    const { providers } = await register([
      { id: 'a-vendor-that-was-dropped', apiKey: 'a-key', models: ['some-model'] },
      { id: 'deepseek', apiKey: 'a-key', models: ['deepseek-v4-pro'] },
    ])

    expect(providers.map(provider => provider.id)).toEqual([userProviderId('deepseek')])
  })

  it('skips a provider whose chosen models no longer exist', async () => {
    const { providers } = await register([
      { id: 'deepseek', apiKey: 'a-key', models: ['a-model-that-was-retired'] },
    ])

    expect(providers).toEqual([])
  })
})

/**
 * Where a request actually goes, which is not what `getModels` reports. pi
 * replaces a model's address with the one its auth resolves, and refuses
 * outright unless the provider declares an api-key method — two ways for a
 * registration that looks right to send somewhere else or nowhere at all.
 */
const sseReply = () => {
  const frame = (delta: unknown, finish: string | null) =>
    `data: ${JSON.stringify({ id: 'a', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
  return new Response(
    `${frame({ role: 'assistant', content: 'hi' }, null)}${frame({}, 'stop')}data: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

const requestFor = async (configured: Parameters<typeof registerUserProviders>[1]) => {
  const sent: { url: string; authorization: string | null }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push({
      url: String(url),
      authorization: new Headers(init?.headers).get('authorization'),
    })
    return sseReply()
  })
  const { models, providers } = await register(configured)
  const model = providers[0]?.models[0]
  if (!model) throw new Error('nothing was registered')
  await models
    .streamSimple(
      model,
      { messages: [{ role: 'user', content: 'hi', timestamp: Date.now() }] },
      { apiKey: 'sk-the-readers-own' },
    )
    .result()
  return sent[0]
}

describe('the request a registered provider sends', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("goes to the mirror when the reader moved a known vendor's address", async () => {
    const request = await requestFor([
      {
        id: 'deepseek',
        apiKey: 'a-key',
        baseUrl: 'https://mirror.example.com/v1',
        models: ['deepseek-v4-pro'],
      },
    ])

    expect(request?.url).toContain('https://mirror.example.com/v1')
    expect(request?.url).not.toContain('api.deepseek.com')
  })

  // The whole custom half of this feature; nothing else exercises its request.
  it("goes to the reader's own endpoint, with the key they gave it", async () => {
    const request = await requestFor([
      {
        id: 'custom:mine',
        apiKey: 'a-key',
        baseUrl: 'https://llm.example.com/v1',
        label: 'Mine',
        models: ['house-model'],
      },
    ])

    expect(request?.url).toContain('https://llm.example.com/v1')
    expect(request?.authorization).toBe('Bearer sk-the-readers-own')
  })
})
