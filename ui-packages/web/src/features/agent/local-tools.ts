import {
  containsControlCharacter,
  isWorkspacePath,
  type StoredFileMetadata,
} from '../../core/files'
import type { ReaderState } from '../../core/reader-state'
import { createLinkTools, type LinkState, type LinkWrites } from './links/link-tools'
import {
  boundedText,
  changedSource,
  decodeCursor,
  encodeCursor,
  firstLines,
  fitsResult,
  integer,
  maximumResultBytes,
  mismatchedCursor,
  record,
  resultBytes,
  sameRange,
  validRange,
} from './pagination'
import {
  type EditActiveSourceInput,
  type EditActiveSourceResult,
  LocalToolError,
  type MoveInput,
  type MoveResult,
  type ReadActiveSourceInput,
  type ReadActiveSourceResult,
  type SourceLineRange,
  type WriteInput,
  type WriteResult,
} from './tool-types'

const root = '/workspace'

// Every path the model names goes through here, so write and move accept the same paths.
const agentWorkspacePath = (path: string) => {
  const relative = path.startsWith(`${root}/`)
    ? path.slice(root.length + 1)
    : path.replace(/^\.\//, '')
  // An absolute path outside the workspace keeps its leading '/', which the check rejects. The
  // model must also stay clear of characters that read as separators or are invisible.
  if (!isWorkspacePath(relative) || relative.includes('\\') || containsControlCharacter(relative))
    throw new LocalToolError(
      'Use a relative workspace path such as notes.md or docs/notes.md without parent traversal.',
    )
  return relative
}

type SourceCursor = {
  operation: 'read-active-source'
  fileId: string
  version: string
  range: SourceLineRange
  offset: number
}
const validSourceCursor = (value: unknown): value is SourceCursor =>
  record(value) &&
  value.operation === 'read-active-source' &&
  typeof value.fileId === 'string' &&
  typeof value.version === 'string' &&
  value.version.length > 0 &&
  validRange(value.range) &&
  value.range.unit === 'line' &&
  integer(value.offset, 0)

export type WorkspaceTextWriter = (
  path: string,
  content: string,
  signal?: AbortSignal,
) => Promise<StoredFileMetadata>

export type WorkspaceFileMover = (
  fileId: string,
  path: string,
  signal?: AbortSignal,
) => Promise<{ from: string; metadata: StoredFileMetadata }>

export type ActiveSourceSnapshot = {
  fileId: string
  path: string
  version: string
  content: string
}

export type ActiveSourceAccess = {
  get: () => ActiveSourceSnapshot | null
  replace: (fileId: string, expectedVersion: string, content: string) => ActiveSourceSnapshot
}

const readActiveSource = (
  access: ActiveSourceAccess,
  input: ReadActiveSourceInput = {},
): ReadActiveSourceResult => {
  if (input.range && (!validRange(input.range) || input.range.unit !== 'line'))
    throw new LocalToolError('Use a positive, one-based line range with end >= start.')
  const decoded = decodeCursor(input.cursor, validSourceCursor)
  if (
    decoded &&
    (decoded.operation !== 'read-active-source' ||
      !input.range ||
      !sameRange(decoded.range, input.range))
  )
    throw mismatchedCursor()
  const cursor = decoded?.operation === 'read-active-source' ? decoded : null
  const source = access.get()
  if (!source)
    throw new LocalToolError('The active file has no editable source or is still loading.')
  if (cursor && (cursor.fileId !== source.fileId || cursor.version !== source.version))
    throw changedSource()
  const lines = source.content.split('\n')
  const count = lines.length
  const range = {
    unit: 'line' as const,
    start: input.range?.start ?? 1,
    end: Math.min(input.range?.end ?? count, count),
  }
  if (range.start > count)
    throw new LocalToolError(`This source has ${count} lines. Choose an available range.`)
  const selected = lines.slice(range.start - 1, range.end).join('\n')
  const offset = cursor?.offset ?? 0
  if (offset > selected.length || (offset > 0 && /[\uDC00-\uDFFF]/.test(selected[offset] ?? '')))
    throw mismatchedCursor()
  const remaining = selected.slice(offset)
  let content = boundedText(firstLines(remaining, 200), maximumResultBytes / 2)
  const build = (): ReadActiveSourceResult => {
    const continuedOffset = offset + content.length
    const next =
      continuedOffset < selected.length
        ? {
            range,
            cursor: encodeCursor({
              operation: 'read-active-source',
              fileId: source.fileId,
              version: source.version,
              range,
              offset: continuedOffset,
            }),
          }
        : null
    const start = range.start + (selected.slice(0, offset).match(/\n/g)?.length ?? 0)
    const end = start + (content.match(/\n/g)?.length ?? 0) - (content.endsWith('\n') ? 1 : 0)
    return {
      fileId: source.fileId,
      path: source.path,
      version: source.version,
      range: content ? { unit: 'line', start, end } : null,
      content,
      next,
    }
  }
  let result = build()
  while (resultBytes(result) > maximumResultBytes && content) {
    content = boundedText(content, Math.floor(new TextEncoder().encode(content).length / 2))
    result = build()
  }
  if (!fitsResult(result) || (remaining && !content))
    throw new LocalToolError('Source metadata exceeds the result limit.')
  return result
}

const editActiveSource = (
  access: ActiveSourceAccess,
  input: EditActiveSourceInput,
): EditActiveSourceResult => {
  const source = access.get()
  if (!source)
    throw new LocalToolError('The active file has no editable source or is still loading.')
  if (typeof input.expectedVersion !== 'string' || input.expectedVersion.length === 0)
    throw new LocalToolError(
      'expectedVersion must be the non-empty string returned by read_active_source.',
    )
  if (source.fileId !== input.fileId || source.version !== input.expectedVersion)
    throw changedSource()
  if (!input.oldText) {
    if (source.content)
      throw new LocalToolError('oldText may be empty only when the active source is empty.')
    return { version: access.replace(input.fileId, input.expectedVersion, input.newText).version }
  }
  const first = source.content.indexOf(input.oldText)
  if (first === -1)
    throw new LocalToolError(
      'oldText was not found in the active source. Read it again and match exactly.',
    )
  if (source.content.indexOf(input.oldText, first + 1) !== -1)
    throw new LocalToolError('oldText occurs more than once. Include more surrounding text.')
  const content = `${source.content.slice(0, first)}${input.newText}${source.content.slice(first + input.oldText.length)}`
  return { version: access.replace(input.fileId, input.expectedVersion, content).version }
}

const noLinks = (): LinkState => {
  throw new LocalToolError('Links are unavailable here.')
}

export const createLocalTools = (
  getReaderState: () => ReaderState,
  writeTextFile: WorkspaceTextWriter,
  moveFile: WorkspaceFileMover,
  activeSource?: ActiveSourceAccess,
  links: () => LinkState = noLinks,
  linkWrites?: LinkWrites,
) => ({
  ...createLinkTools(links, linkWrites),
  get_reader_state: getReaderState,
  write: async (input: WriteInput, signal?: AbortSignal): Promise<WriteResult> => {
    const metadata = await writeTextFile(agentWorkspacePath(input.path), input.content, signal)
    return { fileId: metadata.id, path: metadata.path }
  },
  move: async (input: MoveInput, signal?: AbortSignal): Promise<MoveResult> => {
    const { from, metadata } = await moveFile(input.fileId, agentWorkspacePath(input.path), signal)
    return { fileId: metadata.id, from, path: metadata.path }
  },
  read_active_source: (input?: ReadActiveSourceInput) => {
    if (!activeSource) throw new LocalToolError('Active source editing is unavailable.')
    return readActiveSource(activeSource, input)
  },
  edit_active_source: (input: EditActiveSourceInput) => {
    if (!activeSource) throw new LocalToolError('Active source editing is unavailable.')
    return editActiveSource(activeSource, input)
  },
})
export type LocalTools = ReturnType<typeof createLocalTools>
