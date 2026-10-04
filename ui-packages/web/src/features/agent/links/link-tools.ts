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
import {
  decodeCursor,
  encodeCursor,
  fitsResult,
  integer,
  mismatchedCursor,
  record,
} from '../pagination'
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

type LinkCursor = { operation: string; request: string; index: number }

const validCursor = (value: unknown): value is LinkCursor =>
  record(value) &&
  typeof value.operation === 'string' &&
  typeof value.request === 'string' &&
  integer(value.index, 0)

const maximumEntries = 100

// One page of a list: as many entries as fit the result limit from where the cursor left off.
// A cursor is tied to the request it continues, so it cannot carry over to another.
const paginate = <T, R extends object>(
  operation: string,
  input: { cursor?: string } & Record<string, unknown>,
  items: readonly T[],
  wrap: (entries: T[], next: ({ cursor: string } & Record<string, unknown>) | null) => R,
): R => {
  const { cursor: token, ...request } = input
  const key = JSON.stringify(request)
  const cursor = decodeCursor(token, validCursor)
  if (cursor && (cursor.operation !== operation || cursor.request !== key)) throw mismatchedCursor()
  const entries: T[] = []
  for (let index = cursor?.index ?? 0; index < items.length; index++) {
    const next = { ...request, cursor: encodeCursor({ operation, request: key, index }) }
    const item = items[index] as T
    if (entries.length >= maximumEntries || !fitsResult(wrap([...entries, item], next))) {
      if (!entries.length) throw new LocalToolError('One entry exceeds the result limit.')
      return wrap(entries, next)
    }
    entries.push(item)
  }
  return wrap(entries, null)
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
    return paginate('find_nodes', input, found, (nodes, next) => ({
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
    return paginate('get_links', input, links, (entries, next) => ({
      node: formatNode(ref),
      direction: input.direction,
      links: entries,
      next,
      ...indexing(state),
    }))
  },
})
