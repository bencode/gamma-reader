import {
  type Edge,
  formatNode,
  type LinkGraph,
  type NodeRef,
  nodeKind,
  nodeRef,
  type OutlineEntry,
} from '@gamma-reader/links'
import type { IndexProgress } from '../../links/note-index'
import { fitsResult, mismatchedCursor } from '../pagination'
import { LocalToolError } from '../tool-types'

export type LinkState = { graph: LinkGraph | null; progress: IndexProgress | null }

export type FindNodesInput = { query: string; cursor?: string }
export type GetNodeInput = { node: string; fileId?: string; cursor?: string }
export type GetLinksInput = {
  node: string
  direction: 'in' | 'out'
  fileId?: string
  cursor?: string
}

const maximumEntries = 100

// A request named by its fields in a fixed order, so a model that reorders or drops an empty
// field still continues the same request.
const requestHash = (operation: string, request: Record<string, unknown>) => {
  const canonical = JSON.stringify([
    operation,
    ...Object.keys(request)
      .filter(key => request[key] !== undefined && request[key] !== '')
      .sort()
      .map(key => [key, request[key]]),
  ])
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index++)
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(36)
}

// Cursors stay short, as a model copies them by hand: where the list resumes, and which request
// it continues, such as 100.k3f9a2.
const readCursor = (token: string | undefined, hash: string) => {
  if (token === undefined) return 0
  const match = /^(\d+)\.([0-9a-z]+)$/.exec(token.trim())
  if (!match) throw new LocalToolError('Invalid cursor. Restart the call without a cursor.')
  if (match[2] !== hash) throw mismatchedCursor()
  return Number(match[1])
}

// One page of a list: as many entries as fit the result limit from where the cursor left off,
// with the size of the whole list so a count never depends on reading every page.
const paginate = <T, R extends object>(
  operation: string,
  input: { cursor?: string } & Record<string, unknown>,
  items: readonly T[],
  wrap: (
    entries: T[],
    next: ({ cursor: string } & Record<string, unknown>) | null,
    total: number,
  ) => R,
): R => {
  const { cursor: token, ...request } = input
  const hash = requestHash(operation, request)
  const entries: T[] = []
  for (let index = readCursor(token, hash); index < items.length; index++) {
    const next = { ...request, cursor: `${index}.${hash}` }
    const item = items[index] as T
    if (
      entries.length >= maximumEntries ||
      !fitsResult(wrap([...entries, item], next, items.length))
    ) {
      if (!entries.length) throw new LocalToolError('One entry exceeds the result limit.')
      return wrap(entries, next, items.length)
    }
    entries.push(item)
  }
  return wrap(entries, null, items.length)
}

const graphOf = (state: LinkState) => {
  if (!state.graph) throw new LocalToolError('Links are still being indexed. Try again shortly.')
  return state.graph
}

// A partial index answers with what it has and says so.
const indexing = (state: LinkState) => (state.progress ? { indexing: state.progress } : {})

const parseNode = (raw: string) => {
  const ref = nodeRef(raw)
  if (!ref.page)
    throw new LocalToolError('Name a node as a link names it, such as RAG or RAG#^def.')
  return ref
}

const describeOutline = (page: string) => (entry: OutlineEntry) =>
  entry.kind === 'section'
    ? {
        node: formatNode({ page, heading: entry.title }),
        kind: entry.kind,
        level: entry.level,
        lines: entry.lines,
      }
    : {
        node: formatNode({ page, block: entry.name }),
        kind: entry.kind,
        type: entry.type,
        lines: entry.lines,
        text: entry.text,
      }

// A link starts at the most precise node around it, so its start can be followed in turn.
const describeEdge = (edge: Edge) => ({
  from: {
    node: formatNode(
      edge.from.block ? { page: edge.from.page, block: edge.from.block } : { page: edge.from.page },
    ),
    fileId: edge.from.fileId,
    path: edge.from.path,
    line: edge.from.line,
    ...(edge.from.section ? { section: edge.from.section } : {}),
  },
  to: `${formatNode(edge.to)}${edge.to.pdfPage ? `#page=${edge.to.pdfPage}` : ''}`,
  kind: edge.kind,
  context: edge.context,
})

const missing = (graph: LinkGraph, ref: NodeRef) => {
  const owner = graph.resolve(ref)
  if (owner.kind === 'ambiguous' && nodeKind(ref) !== 'page')
    return new LocalToolError(
      `${ref.page} names ${owner.fileIds.length} files. Pass fileId to choose one; get_node on ${ref.page} lists them.`,
    )
  return new LocalToolError(`No node named ${formatNode(ref)}. Use find_nodes to look it up.`)
}

// The link graph as tools: find a node, look inside one, and follow its links in or out. Each
// answers from the index of saved files, with lines of Markdown source.
export const createLinkTools = (getState: () => LinkState) => ({
  find_nodes: (input: FindNodesInput) => {
    const state = getState()
    const found = graphOf(state)
      .find(input.query)
      .map(node => ({
        node: formatNode(node.ref),
        kind: node.kind,
        references: node.references,
        ...(node.virtual ? { virtual: true } : {}),
      }))
    return paginate('find_nodes', input, found, (nodes, next, total) => ({
      total,
      nodes,
      next,
      ...indexing(state),
    }))
  },

  get_node: (input: GetNodeInput) => {
    const state = getState()
    const graph = graphOf(state)
    const ref = parseNode(input.node)
    const view = graph.node(ref, input.fileId)
    if (!view) throw missing(graph, ref)
    if (view.kind !== 'page')
      return {
        node: formatNode(view.ref),
        kind: view.kind,
        fileId: view.file.id,
        path: view.file.path,
        lines: view.lines,
        text: view.text,
        ...indexing(state),
      }
    const files = view.files.map(file => ({ fileId: file.id, path: file.path }))
    const shared = files.length > 1
    return paginate(
      'get_node',
      input,
      view.outline.map(describeOutline(view.ref.page)),
      (outline, next) => ({
        node: formatNode(view.ref),
        kind: view.kind,
        files,
        ...(files.length === 0 ? { virtual: true } : {}),
        ...(shared
          ? { note: 'Several files share this name. Pass fileId to see one outline.' }
          : {}),
        outline,
        next,
        ...indexing(state),
      }),
    )
  },

  get_links: (input: GetLinksInput) => {
    const state = getState()
    const graph = graphOf(state)
    const ref = parseNode(input.node)
    const links = graph.edges(ref, input.direction, input.fileId).map(describeEdge)
    return paginate('get_links', input, links, (entries, next, total) => ({
      node: formatNode(ref),
      direction: input.direction,
      total,
      links: entries,
      next,
      ...indexing(state),
    }))
  },
})
