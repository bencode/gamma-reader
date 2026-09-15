import { listStoredFiles } from '../data/file-store'
import { openDocumentSource, readDocument, searchPage, unreadableReason } from './document-source'
import { normalizeSearchText } from './document-text'
import type { StoredFileMetadata } from './files'
import {
  type EditActiveSourceInput,
  type EditActiveSourceResult,
  type ListInput,
  type ListResult,
  LocalToolError,
  type ReadActiveSourceInput,
  type ReadActiveSourceResult,
  type ReaderState,
  type SearchInput,
  type SearchResult,
} from './local-tool-types'
import {
  boundedText,
  changedFile,
  changedSource,
  decodeCursor,
  encodeCursor,
  firstLines,
  fitsResult,
  maximumResultBytes,
  mismatchedCursor,
  resultBytes,
  sameRange,
  validRange,
} from './tool-pagination'

const list = async (input: ListInput = {}, signal?: AbortSignal): Promise<ListResult> => {
  signal?.throwIfAborted()
  const name = normalizeSearchText(input.name ?? '')
  if (name.length > 512)
    throw new LocalToolError('Use a shorter file name filter (up to 512 characters).')
  const cursor = decodeCursor(input.cursor)
  if (cursor && (cursor.operation !== 'list' || cursor.name !== name)) throw mismatchedCursor()
  const files = (await listStoredFiles()).filter(file =>
    normalizeSearchText(file.name).includes(name),
  )
  const result: ListResult = { files: [], next: null }
  for (let index = cursor?.index ?? 0; index < files.length; index++) {
    signal?.throwIfAborted()
    const file = files[index]
    if (!file) continue
    const reason = unreadableReason(file)
    const entry = {
      id: file.id,
      name: file.name,
      collection: file.collection ?? 'files',
      type: file.previewKind,
      textReadable: !reason,
      ...(reason ? { reason } : {}),
    }
    const next = {
      ...(name ? { name } : {}),
      cursor: encodeCursor({ operation: 'list', name, index }),
    }
    if (result.files.length >= 100 || !fitsResult({ files: [...result.files, entry], next })) {
      if (!result.files.length) throw new LocalToolError('File metadata exceeds the result limit.')
      return { ...result, next }
    }
    result.files.push(entry)
  }
  return result
}

const search = async (input: SearchInput, signal?: AbortSignal): Promise<SearchResult> => {
  signal?.throwIfAborted()
  const query = normalizeSearchText(input.query)
  if (!query) throw new LocalToolError('Query must contain text. Use list to browse files.')
  if (new TextEncoder().encode(query).length > 1024)
    throw new LocalToolError('Use a shorter search phrase (up to 1024 UTF-8 bytes).')
  const decoded = decodeCursor(input.cursor)
  if (
    decoded &&
    (decoded.operation !== 'search' ||
      decoded.query !== query ||
      decoded.filter !== (input.fileId ?? ''))
  )
    throw mismatchedCursor()
  const cursor = decoded?.operation === 'search' ? decoded : null
  const request = { query, ...(input.fileId !== undefined ? { fileId: input.fileId } : {}) }
  const files = (await listStoredFiles()).filter(
    file => input.fileId === undefined || file.id === input.fileId,
  )
  if (input.fileId !== undefined && !files.length)
    throw new LocalToolError('File removed or not found. Run list to choose an available file.')
  const resumeIndex = cursor ? files.findIndex(file => file.id === cursor.fileId) : 0
  if (resumeIndex < 0) throw changedFile()
  const result: SearchResult = { matches: [], issues: [], next: null }
  for (let index = resumeIndex; index < files.length; index++) {
    signal?.throwIfAborted()
    const file = files[index]
    if (!file) continue
    const resume = index === resumeIndex ? cursor : null
    if (resume && resume.revision !== file.revision) throw changedFile()
    const nextFile = {
      ...request,
      cursor: encodeCursor({
        operation: 'search',
        query,
        filter: input.fileId ?? '',
        fileId: file.id,
        revision: file.revision,
        page: 1,
        match: 0,
      }),
    }
    // Reserve room for an error and a continuation before opening another file.
    if (resultBytes({ ...result, next: nextFile }) > maximumResultBytes - 2048)
      return { ...result, next: nextFile }
    let source: Awaited<ReturnType<typeof openDocumentSource>> | undefined
    try {
      source = await openDocumentSource(file.id, signal)
      if (resume && resume.revision !== source.file.revision) throw changedFile()
      let hasText = false
      for (let page = resume?.page ?? 1; page <= source.pageCount; page++) {
        signal?.throwIfAborted()
        const text = await source.readPage(page)
        hasText ||= Boolean(text.trim())
        let matchIndex = 0
        for (const match of searchPage(text, query, source.unit, page)) {
          const position = matchIndex++
          if (page === resume?.page && position < resume.match) continue
          const next = {
            ...request,
            cursor: encodeCursor({
              operation: 'search',
              query,
              filter: input.fileId ?? '',
              fileId: file.id,
              revision: source.file.revision,
              page,
              match: matchIndex - 1,
            }),
          }
          const entry = {
            fileId: file.id,
            name: file.name,
            ...match,
            excerpt: boundedText(match.excerpt, 1200),
          }
          if (
            result.matches.length >= 10 ||
            !fitsResult({ ...result, matches: [...result.matches, entry], next })
          ) {
            if (!result.matches.length && !result.issues.length)
              throw new LocalToolError(
                'Search result exceeds the output limit. Use a shorter query.',
              )
            return { ...result, next }
          }
          result.matches.push(entry)
        }
      }
      if (!hasText && (!resume || resume.page === 1))
        result.issues.push({
          fileId: file.id,
          name: file.name,
          reason: 'No extractable text in this file. OCR is not available.',
        })
    } catch (error) {
      signal?.throwIfAborted()
      if (source && resume && resume.revision !== source.file.revision) throw error
      if (!(error instanceof LocalToolError))
        console.error('Unable to search file', file.name, error)
      result.issues.push({
        fileId: file.id,
        name: file.name,
        reason: boundedText(
          error instanceof Error ? error.message : 'Unable to read this file.',
          300,
        ),
      })
    } finally {
      await source?.close()
    }
  }
  return result
}

export type WorkspaceTextWriter = (
  name: string,
  content: string,
  signal?: AbortSignal,
) => Promise<StoredFileMetadata>

export type ActiveSourceSnapshot = {
  fileId: string
  name: string
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
  const decoded = decodeCursor(input.cursor)
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
      name: source.name,
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

export const createLocalTools = (
  getReaderState: () => ReaderState,
  writeTextFile: WorkspaceTextWriter,
  activeSource?: ActiveSourceAccess,
) => ({
  list,
  search,
  read: readDocument,
  get_reader_state: getReaderState,
  writeTextFile,
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
