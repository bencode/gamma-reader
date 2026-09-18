import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { readAgentConfig, readGuardConfig, type GuardConfig } from './config.js'

const agentConfig = readAgentConfig({ GLM_API_KEY: 'server-secret' })
const devGuard: GuardConfig = { ...readGuardConfig({}), allowLocalhost: true }
const productionGuard: GuardConfig = { ...readGuardConfig({ NODE_ENV: 'production' }) }

const body = JSON.stringify({
  model: agentConfig.modelId,
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
})

const post = (guard: GuardConfig, headers: Record<string, string>) =>
  createApp(undefined, agentConfig, guard).request('/api/agent/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })

afterEach(() => vi.restoreAllMocks())

describe('origin guard', () => {
  it('rejects browser requests from other sites before contacting the provider', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    expect((await post(devGuard, { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post(productionGuard, { Origin: 'null' })).status).toBe(403)
    expect(fetchModel).not.toHaveBeenCalled()
  })

  it('rejects localhost origins in production when the host differs', async () => {
    const headers = { Origin: 'http://localhost:5173', Host: 'reader.upivot.io' }
    expect((await post(devGuard, headers)).status).not.toBe(403)
    expect((await post(productionGuard, headers)).status).toBe(403)
  })

  it('accepts same-host and explicitly allowed origins', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: ok\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
    )
    const allowEmbed = {
      ...productionGuard,
      extraOrigins: ['https://partner.example'],
    } satisfies GuardConfig
    expect(
      (await post(productionGuard, { Origin: 'https://reader.upivot.io', Host: 'reader.upivot.io' }))
        .status,
    ).toBe(200)
    expect((await post(allowEmbed, { Origin: 'https://partner.example' })).status).toBe(200)
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })
})
