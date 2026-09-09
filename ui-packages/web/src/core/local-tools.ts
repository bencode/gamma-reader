import { listStoredFiles } from '../data/file-store'
import { openDocumentSource, readDocument, searchPage, unreadableReason } from './document-source'
import { normalizeSearchText } from './document-text'
import {
  type ListInput,
  type ListResult,
  LocalToolError,
  type ReaderState,
  type SearchInput,
  type SearchResult,
} from './local-tool-types'
import {
  boundedText,
  changedFile,
  decodeCursor,
  encodeCursor,
  fitsResult,
  maximumResultBytes,
  mismatchedCursor,
  resultBytes,
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

export const createLocalTools = (getReaderState: () => ReaderState) => ({
  list,
  search,
  read: readDocument,
  get_reader_state: getReaderState,
})
export type LocalTools = ReturnType<typeof createLocalTools>
