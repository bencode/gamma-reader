import { afterEach, describe, expect, it, vi } from 'vitest'
import { tavilyExtract, tavilySearch } from './provider.js'

afterEach(() => vi.restoreAllMocks())

describe('Tavily search', () => {
  it('asks with the key and count, and keeps what a reader needs from each result', async () => {
    const fetchSearch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        results: [
          {
            url: 'https://example.org/news',
            title: 'News',
            content: 'Today',
            published_date: '2026-10-01',
            score: 0.9,
          },
          { url: 'https://example.org/long', title: 'Long', content: 'x'.repeat(700) },
          { title: 'No link', content: 'Dropped' },
        ],
      }),
    )

    const hits = await tavilySearch('tvly-key')('action', 3, new AbortController().signal)

    const [url, init] = fetchSearch.mock.calls[0] ?? []
    expect(url).toBe('https://api.tavily.com/search')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tvly-key')
    expect(JSON.parse(String(init?.body))).toEqual({ query: 'action', max_results: 3 })
    expect(hits).toEqual([
      { title: 'News', url: 'https://example.org/news', published: '2026-10-01', snippet: 'Today' },
      { title: 'Long', url: 'https://example.org/long', snippet: `${'x'.repeat(600)}…` },
    ])
  })

  it('fails when Tavily does not answer successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota', { status: 432 }))

    await expect(tavilySearch('k')('x', 1, new AbortController().signal)).rejects.toThrow(
      'Tavily answered 432',
    )
  })

  it('extracts a page as Markdown and fails when Tavily could not', async () => {
    const fetchPage = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              url: 'https://example.org/a',
              title: 'A',
              raw_content: `[Sign in](/login)\n\n# A\n\nText\n${'\nMore'.repeat(10)}`,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [], failed_results: [{ url: 'https://example.org/b' }] }),
      )
    const extract = tavilyExtract('tvly-key')
    const signal = new AbortController().signal

    expect(await extract('https://example.org/a', signal)).toEqual({
      url: 'https://example.org/a',
      title: 'A',
      content: `# A\n\nText\n${'\nMore'.repeat(10)}`,
    })
    const [url, init] = fetchPage.mock.calls[0] ?? []
    expect(url).toBe('https://api.tavily.com/extract')
    expect(JSON.parse(String(init?.body))).toEqual({
      urls: ['https://example.org/a'],
      format: 'markdown',
      extract_depth: 'basic',
    })
    await expect(extract('https://example.org/b', signal)).rejects.toThrow('could not extract')
  })
})
