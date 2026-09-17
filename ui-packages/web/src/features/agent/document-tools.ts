import { findTextMatches, normalizeSearchText } from '../../core/document-text'
import type { StoredFileMetadata } from '../../core/files'
import {
  boundedText,
  changedFile,
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
  type ListInput,
  type ListResult,
  LocalToolError,
  type ReadInput,
  type ReadRange,
  type ReadResult,
  type SearchInput,
  type SearchResult,
} from './tool-types'

export type DocumentSource = {
  file: StoredFileMetadata
  unit: ReadRange['unit']
  pageCount: number
  readPage: (number: number) => Promise<string>
  close: () => Promise<void>
}
export type DocumentAccess = {
  listFiles: () => Promise<StoredFileMetadata[]>
  getReadability: (file: StoredFileMetadata) => { textReadable: boolean; reason?: string }
  open: (fileId: string, signal?: AbortSignal) => Promise<DocumentSource>
}
type DocumentCursor =
  | { operation: 'list'; name: string; index: number }
  | {
      operation: 'search'
      query: string
      filter: string
      fileId: string
      revision: number
      page: number
      match: number
      hasText?: boolean
    }
  | {
      operation: 'read'
      fileId: string
      revision: number
      range: ReadRange
      page: number
      offset: number
    }
const validDocumentCursor = (value: unknown): value is DocumentCursor => {
  if (!record(value)) return false
  if (value.operation === 'list') return typeof value.name === 'string' && integer(value.index, 0)
  if (typeof value.fileId !== 'string' || !integer(value.revision, 1) || !integer(value.page, 1))
    return false
  if (value.operation === 'search')
    return (
      typeof value.query === 'string' &&
      typeof value.filter === 'string' &&
      integer(value.match, 0) &&
      (value.hasText === undefined || typeof value.hasText === 'boolean')
    )
  return value.operation === 'read' && validRange(value.range) && integer(value.offset, 0)
}
const list = async (
  access: DocumentAccess,
  input: ListInput = {},
  signal?: AbortSignal,
): Promise<ListResult> => {
  signal?.throwIfAborted()
  const name = normalizeSearchText(input.name ?? '')
  if (name.length > 512)
    throw new LocalToolError('Use a shorter file name filter (up to 512 characters).')
  const cursor = decodeCursor(input.cursor, validDocumentCursor)
  if (cursor && (cursor.operation !== 'list' || cursor.name !== name)) throw mismatchedCursor()
  const files = (await access.listFiles()).filter(file =>
    normalizeSearchText(file.name).includes(name),
  )
  const result: ListResult = { files: [], next: null }
  for (let index = cursor?.index ?? 0; index < files.length; index++) {
    signal?.throwIfAborted()
    const file = files[index]
    if (!file) continue
    const { reason, textReadable } = access.getReadability(file)
    const entry = {
      id: file.id,
      name: file.name,
      collection: file.collection ?? 'files',
      type: file.previewKind,
      textReadable,
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

const search = async (
  access: DocumentAccess,
  input: SearchInput,
  signal?: AbortSignal,
): Promise<SearchResult> => {
  signal?.throwIfAborted()
  const query = normalizeSearchText(input.query)
  if (!query) throw new LocalToolError('Query must contain text. Use list to browse files.')
  if (new TextEncoder().encode(query).length > 1024)
    throw new LocalToolError('Use a shorter search phrase (up to 1024 UTF-8 bytes).')
  const decoded = decodeCursor(input.cursor, validDocumentCursor)
  if (
    decoded &&
    (decoded.operation !== 'search' ||
      decoded.query !== query ||
      decoded.filter !== (input.fileId ?? ''))
  )
    throw mismatchedCursor()
  const cursor = decoded?.operation === 'search' ? decoded : null
  const request = { query, ...(input.fileId !== undefined ? { fileId: input.fileId } : {}) }
  const files = (await access.listFiles()).filter(
    file => input.fileId === undefined || file.id === input.fileId,
  )
  if (input.fileId !== undefined && !files.length)
    throw new LocalToolError('File removed or not found. Run list to choose an available file.')
  const resumeIndex = cursor ? files.findIndex(file => file.id === cursor.fileId) : 0
  if (resumeIndex < 0) throw changedFile()
  const result: SearchResult = { matches: [], issues: [], next: null }
  const started = performance.now()
  let pagesRead = 0
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
    let source: DocumentSource | undefined
    try {
      source = await access.open(file.id, signal)
      if (resume && resume.revision !== source.file.revision) throw changedFile()
      let hasText = resume?.hasText ?? false
      for (let page = resume?.page ?? 1; page <= source.pageCount; page++) {
        signal?.throwIfAborted()
        if (pagesRead >= 20 || (pagesRead > 0 && performance.now() - started >= 2_000))
          return {
            ...result,
            next: {
              ...request,
              cursor: encodeCursor({
                operation: 'search',
                query,
                filter: input.fileId ?? '',
                fileId: file.id,
                revision: source.file.revision,
                page,
                match: 0,
                hasText,
              }),
            },
          }
        const text = await source.readPage(page)
        pagesRead++
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
              hasText,
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
      if (!hasText)
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

export function* searchPage(text: string, query: string, unit: ReadRange['unit'], page: number) {
  if (unit === 'line') {
    for (const match of findTextMatches(text, query))
      yield { range: { unit, start: match.start, end: match.end }, excerpt: match.excerpt }
    return
  }
  const match = findTextMatches(text, query).next().value
  if (match) yield { range: { unit, start: page, end: page }, excerpt: match.excerpt }
}

const readDocument = async (
  access: DocumentAccess,
  input: ReadInput,
  signal?: AbortSignal,
): Promise<ReadResult> => {
  if (input.range && !validRange(input.range))
    throw new LocalToolError('Use a positive, one-based range with end >= start.')
  const decoded = decodeCursor(input.cursor, validDocumentCursor)
  if (
    decoded &&
    (decoded.operation !== 'read' ||
      decoded.fileId !== input.fileId ||
      !input.range ||
      !sameRange(decoded.range, input.range))
  )
    throw mismatchedCursor()
  const cursor = decoded?.operation === 'read' ? decoded : null
  const source = await access.open(input.fileId, signal)
  try {
    if (cursor && cursor.revision !== source.file.revision) throw changedFile()
    if (input.range && input.range.unit !== source.unit)
      throw new LocalToolError(`Use unit="${source.unit}" for this file.`)
    const page = cursor?.page ?? (source.unit === 'page' ? (input.range?.start ?? 1) : 1)
    if (page > source.pageCount)
      throw new LocalToolError(
        `This file has ${source.pageCount} pages. Choose an available range.`,
      )
    const text = await source.readPage(page)
    const lines = text.split('\n')
    const count = source.unit === 'line' ? lines.length : source.pageCount
    const range = {
      unit: source.unit,
      start: input.range?.start ?? 1,
      end: Math.min(input.range?.end ?? count, count),
    }
    if (range.start > count)
      throw new LocalToolError(`This file has ${count} ${source.unit}s. Choose an available range.`)
    if (source.unit === 'page' && (page < range.start || page > range.end)) throw mismatchedCursor()
    const selected =
      source.unit === 'line' ? lines.slice(range.start - 1, range.end).join('\n') : text
    const offset = cursor?.offset ?? 0
    if (offset > selected.length || (offset > 0 && /[\uDC00-\uDFFF]/.test(selected[offset] ?? '')))
      throw mismatchedCursor()
    const remaining = selected.slice(offset)
    let content = boundedText(
      source.unit === 'line' ? firstLines(remaining, 200) : remaining,
      maximumResultBytes / 2,
    )
    const build = (): ReadResult => {
      const continuedOffset = offset + content.length
      const moreInPage = continuedOffset < selected.length
      const nextPage = moreInPage ? page : page + 1
      const next =
        moreInPage || (source.unit === 'page' && page < range.end)
          ? {
              fileId: input.fileId,
              range,
              cursor: encodeCursor({
                operation: 'read',
                fileId: input.fileId,
                revision: source.file.revision,
                range,
                page: nextPage,
                offset: moreInPage ? continuedOffset : 0,
              }),
            }
          : null
      const start = range.start + (selected.slice(0, offset).match(/\n/g)?.length ?? 0)
      const end = start + (content.match(/\n/g)?.length ?? 0) - (content.endsWith('\n') ? 1 : 0)
      return {
        fileId: input.fileId,
        name: source.file.name,
        range:
          source.unit === 'page'
            ? { unit: 'page', start: page, end: page }
            : content
              ? { unit: 'line', start, end }
              : null,
        content,
        next,
        ...(!selected.trim() ? { notice: 'No extractable text in this range.' } : {}),
      }
    }
    let result = build()
    while (resultBytes(result) > maximumResultBytes && content) {
      content = boundedText(content, Math.floor(new TextEncoder().encode(content).length / 2))
      result = build()
    }
    if (!fitsResult(result) || (remaining && !content))
      throw new LocalToolError('File metadata exceeds the result limit.')
    return result
  } finally {
    await source.close()
  }
}

export const createDocumentTools = (access: DocumentAccess) => ({
  list: (input?: ListInput, signal?: AbortSignal) => list(access, input, signal),
  search: (input: SearchInput, signal?: AbortSignal) => search(access, input, signal),
  read: (input: ReadInput, signal?: AbortSignal) => readDocument(access, input, signal),
})
