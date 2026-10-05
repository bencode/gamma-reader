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

// Calls Tavily, through an HTTP proxy when one is given; only Tavily traffic takes it.
const tavilyClient = (apiKey: string, proxy?: string) => {
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined
  return async (endpoint: 'search' | 'extract', body: object, signal: AbortSignal) => {
    const init = {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
    const url = `https://api.tavily.com/${endpoint}`
    const response = dispatcher
      ? await proxiedFetch(url, { ...init, dispatcher })
      : await fetch(url, init)
    if (!response.ok) throw new Error(`Tavily answered ${response.status}`)
    return (await response.json()) as Record<string, unknown>
  }
}

export const tavilySearch = (apiKey: string, proxy?: string): SearchProvider => {
  const call = tavilyClient(apiKey, proxy)
  return async (query, count, signal) => {
    const body = await call('search', { query, max_results: count }, signal)
    if (!Array.isArray(body.results)) return []
    return body.results.flatMap((result: unknown) =>
      typeof result === 'object' && result !== null ? tavilyHit(result as TavilyResult) : [],
    )
  }
}

export type ExtractedPage = { url: string; title?: string; content: string }

// Takes a page's readable text, for a page a browser may not download itself.
export type PageExtractor = (url: string, signal: AbortSignal) => Promise<ExtractedPage>

// A saved page is read as a document, and one larger than this would not be.
const maximumPageCharacters = 1_000_000

// A page's navigation comes before its title. Text before a title near the top is dropped; a
// page whose first title comes late keeps everything, so no article text is lost.
const fromTitle = (content: string) => {
  const lines = content.split('\n')
  const title = lines.findIndex(line => line.startsWith('# '))
  return title > 0 && title < lines.length * 0.3 ? lines.slice(title).join('\n') : content
}

export const tavilyExtract = (apiKey: string, proxy?: string): PageExtractor => {
  const call = tavilyClient(apiKey, proxy)
  return async (url, signal) => {
    const body = await call(
      'extract',
      { urls: [url], format: 'markdown', extract_depth: 'basic' },
      signal,
    )
    const page = Array.isArray(body.results) ? body.results[0] : undefined
    const fields =
      typeof page === 'object' && page !== null ? (page as Record<string, unknown>) : {}
    const raw = fields.raw_content
    if (typeof raw !== 'string' || !raw.trim())
      throw new Error('Tavily could not extract the page.')
    const content = fromTitle(raw)
    return {
      url,
      ...(typeof fields.title === 'string' &&
        fields.title.trim() && { title: fields.title.trim() }),
      content:
        content.length > maximumPageCharacters
          ? `${content.slice(0, maximumPageCharacters)}\n\n… The rest of the page was left out.`
          : content,
    }
  }
}
