import { describe, expect, it } from 'vitest'
import { resolveModelProxyConfig } from './config.js'
import settings from './providers.json' with { type: 'json' }

describe('model configuration', () => {
  it('offers Token Plan models only with its credential and keeps GLM as the default', () => {
    const tokenPlan = {
      id: 'qwen-token-plan-cn',
      chatModels: ['deepseek-v4.1-flash', 'qwen3.8-flash', 'deepseek-v4-pro', 'qwen3.8-max'],
    }
    const env = { QWEN_TOKEN_PLAN_CN_API_KEY: 'token-plan-secret' }
    const only = resolveModelProxyConfig(settings, env)
    expect(only.publicConfig).toEqual({
      enabled: true,
      providers: [tokenPlan],
      defaultModel: { provider: tokenPlan.id, modelId: 'deepseek-v4.1-flash' },
    })
    expect(only.providers[tokenPlan.id]?.baseUrl).toBe(
      'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    )
    expect(
      resolveModelProxyConfig(settings, { ...env, GLM_API_KEY: 'glm-secret' }).publicConfig,
    ).toEqual({
      enabled: true,
      providers: [{ id: 'zai-coding-cn', chatModels: ['glm-5.3'] }, tokenPlan],
      defaultModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3' },
      visionModel: { provider: 'zai-coding-cn', modelId: 'glm-5.3-flash' },
    })
  })

  it('keeps the available provider usable without the default provider key', () => {
    const { publicConfig } = resolveModelProxyConfig(settings, {
      DEEPSEEK_API_KEY: 'deepseek-secret',
    })
    expect(publicConfig).toEqual({
      enabled: true,
      providers: [{ id: 'deepseek', chatModels: ['deepseek-flash', 'deepseek-v4-pro'] }],
      defaultModel: { provider: 'deepseek', modelId: 'deepseek-flash' },
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
