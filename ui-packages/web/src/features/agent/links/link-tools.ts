import {
  type Edge,
  formatNode,
  isNotePath,
  type LinkGraph,
  NameBlockError,
  type NodeRef,
  nameBlock,
  nodeKind,
  nodeRef,
  type OutlineEntry,
  pageTitleOf,
  parseNote,
} from '@gamma-reader/links'
import type { StoredFileMetadata } from '../../../core/files'
import type { UpdateStoredTextFileResult } from '../../../data/file-store'
import type { NoteIndexState } from '../../links/note-index'
import { paginate } from '../pagination'
import { LocalToolError } from '../tool-types'

export type FindNodesInput = { query: string; cursor?: string }
export type GetNodeInput = { node: string; fileId?: string; cursor?: string }
export type NameBlockInput = { fileId: string; quote: string; name: string }

// What naming a block needs of the library: a file, whether an open tab holds unsaved edits to
// it, its saved text, and a save that fails if the file changed since it was read.
export type LinkWrites = {
  file: (fileId: string) => StoredFileMetadata | undefined
  dirty: (fileId: string) => boolean
  read: (fileId: string) => Promise<string>
  update: (fileId: string, revision: number, content: string) => Promise<UpdateStoredTextFileResult>
}

// What the link tools read and write: the index of saved notes, and the library to name blocks in.
export type LinkAccess = { state: () => NoteIndexState } & LinkWrites

export type GetLinksInput = {
  node: string
  direction: 'in' | 'out'
  fileId?: string
  cursor?: string
}

const readyGraph = (state: NoteIndexState) => {
  if (!state.graph) throw new LocalToolError('Links are still being indexed. Try again shortly.')
  return state.graph
}

// A partial index answers with what it has and says so.
const indexing = (state: NoteIndexState) => (state.progress ? { indexing: state.progress } : {})

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

const unavailable = () => {
  throw new LocalToolError('Links are unavailable here.')
}

// Where there is no library to link, as in a conversation without a workspace.
export const noLinks: LinkAccess = {
  state: unavailable,
  file: unavailable,
  dirty: unavailable,
  read: unavailable,
  update: unavailable,
}

const named = (source: string, input: NameBlockInput) => {
  try {
    return nameBlock(source, input.quote, input.name)
  } catch (cause) {
    if (cause instanceof NameBlockError) throw new LocalToolError(cause.message, { cause })
    throw cause
  }
}

// The link graph as tools: find a node, look inside one, and follow its links in or out. Each
// answers from the index of saved files, with lines of Markdown source.
export const createLinkTools = (links: LinkAccess) => ({
  find_nodes: (input: FindNodesInput) => {
    const state = links.state()
    const found = readyGraph(state)
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
    const state = links.state()
    const graph = readyGraph(state)
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
    const state = links.state()
    const graph = readyGraph(state)
    const ref = parseNode(input.node)
    const edges = graph.edges(ref, input.direction, input.fileId).map(describeEdge)
    return paginate('get_links', input, edges, (entries, next, total) => ({
      node: formatNode(ref),
      direction: input.direction,
      total,
      links: entries,
      next,
      ...indexing(state),
    }))
  },

  // Names a passage of a saved note so it can be linked. Only the saved file changes; a note with
  // unsaved edits in a tab is left to the reader, so neither copy overwrites the other.
  name_block: async (input: NameBlockInput) => {
    const file = links.file(input.fileId)
    if (!file || !isNotePath(file.path))
      throw new LocalToolError('Name blocks in a Markdown note. Pass its fileId.')
    if (links.dirty(file.id))
      throw new LocalToolError(
        `${file.path} has unsaved changes in an open tab. Ask the reader to save or discard them first.`,
      )
    const result = named(await links.read(file.id), input)
    if (result.created) {
      const saved = await links.update(file.id, file.revision, result.source)
      if (saved.status === 'conflict')
        throw new LocalToolError(
          `${file.path} changed while it was being named. Call name_block again.`,
        )
      if (saved.status !== 'saved') throw new LocalToolError(`${file.path} could not be saved.`)
    }
    const node = formatNode({
      page: pageTitleOf(file, parseNote(result.source)),
      block: result.name,
    })
    return { node, link: `[[${node}]]`, created: result.created }
  },
})
