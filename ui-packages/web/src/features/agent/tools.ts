import { Type } from '@earendil-works/pi-ai'
import type { createDocumentTools } from './document-tools'
import type { LocalTools } from './local-tools'
import { bind } from './tool'

const cursor = Type.Optional(
  Type.String({ description: 'Opaque cursor from next. Copy it unchanged.' }),
)
const fileId = Type.String({ description: 'File ID returned by list, search or get_reader_state.' })
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
  ]
  return tools
}
