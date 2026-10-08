import { Type } from '@earendil-works/pi-ai'
import { bind } from '../../core/agent/tool'
import type { createDocumentTools } from './document-tools'
import type { LocalTools } from './local-tools'

const cursor = Type.Optional(
  Type.String({ description: 'Opaque cursor from next. Copy it unchanged.' }),
)
const fileId = Type.String({ description: 'File ID returned by list, search or get_reader_state.' })
const node = Type.String({
  minLength: 1,
  description: 'A node named as a link names it: Page, Page#Heading or Page#^name.',
})
const cells = Type.Optional(
  Type.Array(Type.Union([Type.Integer({ minimum: 1 }), Type.String({ minLength: 1 })]), {
    description:
      'Cells as the reader names them: a number shown on the cell (#1 is the first), a cell id, or "current" for the cell the reader is in. Omit, or pass [], for every cell.',
  }),
)
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
      'Replace one unique exact oldText in the active source draft. Pass fileId and expectedVersion from read_active_source. expectedVersion is a short code such as k7m2x9qp; copy it character for character. Does not save to IndexedDB. If the active file or version changed, read again. Empty oldText is allowed only for an empty source.',
      Type.Object({
        fileId,
        expectedVersion: Type.String({ minLength: 1 }),
        oldText: Type.String(),
        newText: Type.String(),
      }),
      local.edit_active_source,
    ),
    bind(
      'run_active_lab_cells',
      [
        "Run code cells of the lab (.lab.md) in the active tab and return each cell's outputs and error.",
        'cells: run these cells in the given order, each a number as the reader sees it (#1 is the first cell), a cell id, or "current" for the cell the reader is in; omit it or pass [] to run every cell from the top.',
        'Numbers follow the document as it is now and shift when cells are inserted; to act again on a cell from an earlier result, pass its id. Each result names cells by number and id, and current is the number of the cell the reader is in.',
        'Runs the code as it is in the draft now, including unsaved edits. Stops at the first cell that does not succeed; the cells after it are skipped.',
        "Cells run in the reader's own lab session, visible to the reader: Scheme, Clojure and Python definitions carry over between cells and runs, TypeScript cells share nothing.",
        "status: succeeded | failed (error holds the message; the session is kept) | stopped (with error: the cell did not start, call again; without error: the reader pressed Stop and that language's session was cleared, so run from the top) | skipped.",
      ].join(' '),
      Type.Object({ cells }),
      local.run_active_lab_cells,
    ),
    bind(
      'read_active_lab_cells',
      [
        'Read the latest result of code cells of the lab in the active tab without running them, whoever ran them.',
        'cells: these cells, each a number as the reader sees it, a cell id, or "current"; omit it or pass [] for every cell.',
        "status: idle (never run) | running | succeeded | failed | stopped, with outputs and error. stale is true when the cell's code changed after that run.",
      ].join(' '),
      Type.Object({ cells }),
      local.read_active_lab_cells,
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
