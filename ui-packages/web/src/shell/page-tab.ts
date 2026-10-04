import { type LinkGraph, pageKey } from '@gamma-reader/links'

// A page that no note holds, open in a tab. Its id stands beside file ids, which are nanoids and
// never contain ':'; it holds the page as links match it, so [[RAG]] and [[rag]] share a tab.
const prefix = 'page:'

export const pageTabId = (name: string) => `${prefix}${pageKey(name)}`

export const pageOfTab = (id: string) => (id.startsWith(prefix) ? id.slice(prefix.length) : null)

export const pagePath = (page: string) => `/pages/${encodeURIComponent(page)}`

// The name a page goes by: as its note is named, or as links first write it, else as the tab
// keeps it until the library is indexed.
export const pageName = (graph: LinkGraph | null | undefined, page: string) =>
  graph?.node({ page })?.ref.page ?? page
