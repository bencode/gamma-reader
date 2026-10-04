import { Type } from '@earendil-works/pi-ai'
import type { createDocumentTools } from './document-tools'
import type { LocalTools } from './local-tools'
import { bind } from './tool'

const cursor = Type.Optional(
  Type.String({ description: 'Opaque cursor from next. Copy it unchanged.' }),
)
const fileId = Type.String({ description: 'File ID returned by list, search or get_reader_state.' })
const node = Type.String({
  minLength: 1,
  description: 'A node named as a link names it: Page, Page#Heading or Page#^name.',
})
const range = Type.Object({
  unit: Type.Union([Type.Literal('line'), Type.Literal('page')]),
  start: Type.Integer({ minimum: 1 }),
  end: Type.Integer({ minimum: 1 }),
})

export const createReaderTools = (
  local: LocalTools,
  documents: ReturnType<typeof createDocumentTools>,
) => {
  const tools = [
    bind(
      'list',
      'List workspace files and chat attachments by path, including whether their text is readable. path filters to paths containing that text. Follow next to continue.',
      Type.Object({ path: Type.Optional(Type.String()), cursor }),
      documents.list,
    ),
    bind(
      'search',
      'Find literal text, ignoring case and whitespace differences. Search one file or all files. Results include excerpts and one-based inclusive ranges for read. Follow next even when matches is empty: searching is incomplete until next is null. Issues report unreadable files.',
      Type.Object({ query: Type.String({ minLength: 1 }), fileId: Type.Optional(fileId), cursor }),
      documents.search,
    ),
    bind(
      'read',
      'Read file text using an optional one-based inclusive line or PDF page range. Markdown lines refer to extracted readable text, not Markdown source. Follow next unchanged for remaining content.',
      Type.Object({ fileId, range: Type.Optional(range), cursor }),
      documents.read,
    ),
    bind(
      'get_reader_state',
      'Get open tabs, the active file and visible text anchors at the time of this call. A null viewport means visible text is unavailable. Search anchors to locate a readable range.',
      Type.Object({}),
      () => local.get_reader_state(),
    ),
    bind(
      'read_active_source',
      'Read raw source of the active editable file, including unsaved changes. Ranges are one-based inclusive lines. Follow next unchanged to continue. Returns fileId and an opaque version string for edit_active_source; pass the version unchanged.',
      Type.Object({
        range: Type.Optional(
          Type.Object({
            unit: Type.Literal('line'),
            start: Type.Integer({ minimum: 1 }),
            end: Type.Integer({ minimum: 1 }),
          }),
        ),
        cursor,
      }),
      local.read_active_source,
    ),
    bind(
      'edit_active_source',
      'Replace one unique exact oldText in the active source draft. Pass fileId and expectedVersion from read_active_source. Does not save to IndexedDB. If the active file or version changed, read again. Empty oldText is allowed only for an empty source.',
      Type.Object({
        fileId,
        expectedVersion: Type.String({ minLength: 1 }),
        oldText: Type.String(),
        newText: Type.String(),
      }),
      local.edit_active_source,
    ),
    bind(
      'move',
      'Move or rename one workspace file by fileId to a new path such as docs/notes.md. Folders follow from the path. Content, the file id and open tabs are kept. Fails when another file already has that path; chat attachments cannot be moved.',
      Type.Object({ fileId, path: Type.String({ minLength: 1 }) }),
      local.move,
    ),
    bind(
      'write',
      'Create or completely overwrite one UTF-8 text file in the browser workspace. Use a workspace path such as notes.md or docs/notes.md; folders follow from the path. Returns the fileId and path of the written file.',
      Type.Object({ path: Type.String({ minLength: 1 }), content: Type.String() }),
      local.write,
    ),
    bind(
      'find_nodes',
      'Find nodes of the link graph whose name contains query, ignoring case, the most linked first. Nodes are pages (notes, other files, and virtual pages that are only linked to), sections under a heading (Page#Heading) and named blocks (Page#^name). An empty query lists pages. total counts every match; call again with next to continue.',
      Type.Object({ query: Type.String(), cursor }),
      local.find_nodes,
    ),
    bind(
      'get_node',
      'Look inside a node named as a link names it, such as RAG, RAG#Heading or RAG#^name. A page shows its files and an outline of its sections and named blocks, each with the node to pass on; a section or block shows its file, source lines and text. Pass fileId when several files share a page name.',
      Type.Object({ node, fileId: Type.Optional(fileId), cursor }),
      local.get_node,
    ),
    bind(
      'get_links',
      "Follow a node's links. in: links pointing to it; for a page these include links to its sections and blocks. out: links written inside it. Each link starts at from.node, the innermost named block or the page. To learn what linking notes discuss or link to, call get_links out on their from.node values instead of reading whole files. total counts every link. Results come in batches: while next is non-null the batch is incomplete, so call again with next before saying something is absent. line is a Markdown source line, not a read range; locate the text with search on context. Covers saved files only.",
      Type.Object({
        node,
        direction: Type.Union([Type.Literal('in'), Type.Literal('out')]),
        fileId: Type.Optional(fileId),
        cursor,
      }),
      local.get_links,
    ),
    bind(
      'name_block',
      'Give the passage that holds quote a block name, so it can be linked as Page#^name. quote is text of that one passage as read, search or get_node shows it. name uses letters, digits and hyphens and describes the passage, such as retrieval-first. A passage that already has a name keeps it. Changes the saved note, not a draft, and returns the link to write with edit_active_source.',
      Type.Object({
        fileId,
        quote: Type.String({ minLength: 1 }),
        name: Type.String({ minLength: 1 }),
      }),
      local.name_block,
    ),
  ]
  return tools
}
