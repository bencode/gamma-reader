import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from './discover'

const endpoint = 'https://api.example.com/v1'
const catalogue = { data: [{ id: 'model-a' }, { id: 'model-b' }, { nope: true }] }

afterEach(() => vi.restoreAllMocks())

describe('listModels', () => {
  it('asks the endpoint for its catalogue with the key', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(catalogue))

    expect(await listModels(endpoint, 'a-key')).toEqual({
      ok: true,
      models: ['model-a', 'model-b'],
    })
    expect(request.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/models')
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer a-key' })
  })

  it.each([
    { status: 401, reason: 'key' },
    { status: 403, reason: 'key' },
    { status: 404, reason: 'endpoint' },
    { status: 500, reason: 'unknown' },
  ])('reports $status as $reason', async ({ status, reason }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status }))

    expect(await listModels(endpoint, 'a-key')).toEqual({ ok: false, reason })
  })

  it('treats an endpoint that answers with no models as the wrong address', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }))

    expect(await listModels(endpoint, 'a-key')).toEqual({ ok: false, reason: 'endpoint' })
  })

  // A browser refusing to read a reply and a host that answers nothing both
  // arrive as a bare TypeError. Telling them apart is the whole point: one is
  // the endpoint's configuration, the other is the network.
  it('separates a reply the browser may not read from a host that is not there', async () => {
    const attempts: (RequestInit | undefined)[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      attempts.push(init)
      // A real opaque response cannot be built here; resolving is what counts.
      if (init?.mode === 'no-cors') return new Response(null, { status: 200 })
      throw new TypeError('Failed to fetch')
    })

    expect(await listModels(endpoint, 'a-key')).toEqual({ ok: false, reason: 'blocked' })
    expect(attempts[1]?.mode).toBe('no-cors')
    expect(attempts[1]?.headers).toBeUndefined()
  })

  it('reports an unreachable host as unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await listModels(endpoint, 'a-key')).toEqual({ ok: false, reason: 'unreachable' })
  })
})
