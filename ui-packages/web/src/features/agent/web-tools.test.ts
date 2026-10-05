import { afterEach, describe, expect, it, vi } from 'vitest'
import { bind } from './tool'
import { webSearchTool, withWebSearch } from './web-tools'

afterEach(() => vi.restoreAllMocks())

const run = (input: { query: string; count?: number }) =>
  webSearchTool.execute('call', input, new AbortController().signal)

describe('web search tool', () => {
  it('is added once while web search is on and removed when it is off', () => {
    const read = bind('read', 'Read', webSearchTool.parameters, () => null)
    const on = withWebSearch(withWebSearch([read], true), true)

    expect(on.map(tool => tool.name)).toEqual(['read', 'web_search'])
    expect(withWebSearch(on, false).map(tool => tool.name)).toEqual(['read'])
  })

  it('returns the results the server found', async () => {
    const hit = { title: 'SICM 1.4', url: 'https://example.org/sicm', snippet: 'Actions' }
    const fetchSearch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ results: [hit] }))

    const result = await run({ query: 'computing actions', count: 3 })

    expect(JSON.parse(String(fetchSearch.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'computing actions',
      count: 3,
    })
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ query: 'computing actions', results: [hit] }) },
    ])
  })

  it("passes on the server's reason, or a general one when there is none", async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'Web search is unavailable.' } }, { status: 503 }),
      )
      .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))

    await expect(run({ query: 'x' })).rejects.toThrow('Web search is unavailable.')
    await expect(run({ query: 'x' })).rejects.toThrow('The web search failed. Try again later.')
  })
})
