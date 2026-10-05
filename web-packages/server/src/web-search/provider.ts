import { ProxyAgent, fetch as proxiedFetch } from 'undici'

export type SearchHit = { title: string; url: string; published?: string; snippet: string }

// What every search service is reduced to, so the route and the agent never depend on one.
export type SearchProvider = (
  query: string,
  count: number,
  signal: AbortSignal,
) => Promise<SearchHit[]>

// A long snippet would fill the conversation and the reader's allowance with one search.
const maximumSnippet = 600

const snippet = (text: string) =>
  text.length > maximumSnippet ? `${text.slice(0, maximumSnippet).trimEnd()}…` : text

type TavilyResult = { url?: unknown; title?: unknown; content?: unknown; published_date?: unknown }

const tavilyHit = (result: TavilyResult): SearchHit[] =>
  typeof result.url === 'string' && typeof result.title === 'string'
    ? [
        {
          title: result.title,
          url: result.url,
          ...(typeof result.published_date === 'string' && { published: result.published_date }),
          snippet: snippet(typeof result.content === 'string' ? result.content : ''),
        },
      ]
    : []

// Searches through an HTTP proxy when one is given; only search traffic takes it.
export const tavilySearch = (apiKey: string, proxy?: string): SearchProvider => {
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined
  return async (query, count, signal) => {
    const init = {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: count }),
    }
    const url = 'https://api.tavily.com/search'
    const response = dispatcher
      ? await proxiedFetch(url, { ...init, dispatcher })
      : await fetch(url, init)
    if (!response.ok) throw new Error(`Tavily answered ${response.status}`)
    const body = (await response.json()) as { results?: unknown }
    if (!Array.isArray(body.results)) return []
    return body.results.flatMap((result: unknown) =>
      typeof result === 'object' && result !== null ? tavilyHit(result as TavilyResult) : [],
    )
  }
}
