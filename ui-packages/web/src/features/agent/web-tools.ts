import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { fitsResult } from './pagination'
import { bind } from './tool'
import { LocalToolError } from './tool-types'

type SearchHit = { title: string; url: string; published?: string; snippet: string }

// The server explains a refusal as { error: { message } }; anything else, such as a proxy's HTML
// error page, gets a general message.
export const refusal = async (response: Response) => {
  const fallback = 'The web search failed. Try again later.'
  try {
    const body: { error?: { message?: unknown } } | null = JSON.parse(await response.text())
    const message = body?.error?.message
    return typeof message === 'string' ? message : fallback
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause
    return fallback
  }
}

const search = async (input: { query: string; count?: number }, signal?: AbortSignal) => {
  const response = await fetch('/api/agent/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: input.query, ...(input.count && { count: input.count }) }),
    signal,
  })
  if (!response.ok) throw new LocalToolError(await refusal(response))
  const hits = ((await response.json()) as { results: SearchHit[] }).results
  // The server already shortens each snippet; this keeps the whole answer within a tool result.
  const fitting = hits.filter((_, index) =>
    fitsResult({ query: input.query, results: hits.slice(0, index + 1) }),
  )
  return { query: input.query, results: fitting }
}

export const webSearchTool = bind(
  'web_search',
  'Search the web. Returns up to count results (default 5) with title, url, published date when known, and a short snippet. Cite the url of every result you use.',
  Type.Object({
    query: Type.String({ minLength: 1, maxLength: 500 }),
    count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
  }),
  search,
)

// The reader turns web search on per conversation; the agent has the tool only while it is on.
export const withWebSearch = (tools: readonly AgentTool[], on: boolean): AgentTool[] => {
  const others = tools.filter(tool => tool.name !== webSearchTool.name)
  return on ? [...others, webSearchTool] : others
}
