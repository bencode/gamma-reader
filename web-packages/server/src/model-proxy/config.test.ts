import { describe, expect, it } from 'vitest'
import { resolveModelProxyConfig } from './config.js'
import settings from './providers.json' with { type: 'json' }

describe('model configuration', () => {
  it('keeps the available provider usable without the default provider key', () => {
    const { publicConfig } = resolveModelProxyConfig(settings, {
      DEEPSEEK_API_KEY: 'deepseek-secret',
    })
    expect(publicConfig).toEqual({
      enabled: true,
      providers: [{ id: 'deepseek', chatModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] }],
      defaultModel: { provider: 'deepseek', modelId: 'deepseek-v4-flash' },
    })
    expect(resolveModelProxyConfig(settings, {}).publicConfig).toEqual({ enabled: false })
  })

  it.each([
    {
      source: { ...settings, defaultModel: { provider: 'deepseek', modelId: 'glm-5.3' } },
      path: 'defaultModel',
    },
    {
      source: { ...settings, visionModel: { provider: 'deepseek', modelId: 'deepseek-v4-pro' } },
      path: 'visionModel',
    },
    {
      source: {
        ...settings,
        providers: { deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', chatModels: ['unknown-model'] } },
      },
      path: 'providers.deepseek.chatModels',
    },
    {
      source: {
        ...settings,
        providers: { unknown: { apiKeyEnv: 'UNKNOWN_KEY', chatModels: ['glm-5.3'] } },
      },
      path: 'providers.unknown',
    },
  ])('rejects invalid model references at $path even without credentials', ({ source, path }) => {
    expect(() => resolveModelProxyConfig(source, {})).toThrow(path)
  })
})
