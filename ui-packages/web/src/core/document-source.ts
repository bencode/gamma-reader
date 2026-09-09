import { getStoredFile } from '../data/file-store'
import { findTextMatches, markdownText, normalizeNewlines } from './document-text'
import { maximumTextPreviewBytes, type StoredFileMetadata } from './files'
import { LocalToolError, type ReadInput, type ReadRange, type ReadResult } from './local-tool-types'
import {
  boundedText,
  changedFile,
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

export const unreadableReason = (file: StoredFileMetadata) => {
  if (file.previewKind === 'pdf') return undefined
  if (file.previewKind !== 'markdown' && file.previewKind !== 'text')
    return 'Text reading is not supported for this format yet.'
  if (file.size > maximumTextPreviewBytes)
    return 'Text reading is limited to files of 5 MiB or less.'
  return undefined
}

export type DocumentSource = {
  file: StoredFileMetadata
  unit: ReadRange['unit']
  pageCount: number
  readPage: (number: number) => Promise<string>
  close: () => Promise<void>
}

export const openDocumentSource = async (
  fileId: string,
  signal?: AbortSignal,
): Promise<DocumentSource> => {
  signal?.throwIfAborted()
  const stored = await getStoredFile(fileId)
  if (!stored)
    throw new LocalToolError('File removed or not found. Run list to choose an available file.')
  const reason = unreadableReason(stored.metadata)
  if (reason) throw new LocalToolError(reason)
  if (stored.metadata.previewKind === 'pdf') {
    const { openPdfSource } = await import('./pdf-source')
    return { file: stored.metadata, unit: 'page', ...(await openPdfSource(stored.blob, signal)) }
  }
  const bytes = await stored.blob.arrayBuffer()
  signal?.throwIfAborted()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause
    throw new LocalToolError('This file is not valid UTF-8. Import a UTF-8 copy.', { cause })
  }
  const content =
    stored.metadata.previewKind === 'markdown' ? markdownText(text) : normalizeNewlines(text)
  return {
    file: stored.metadata,
    unit: 'line',
    pageCount: 1,
    readPage: async () => content,
    close: async () => {},
  }
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

export const readDocument = async (input: ReadInput, signal?: AbortSignal): Promise<ReadResult> => {
  if (input.range && !validRange(input.range))
    throw new LocalToolError('Use a positive, one-based range with end >= start.')
  const decoded = decodeCursor(input.cursor)
  if (
    decoded &&
    (decoded.operation !== 'read' ||
      decoded.fileId !== input.fileId ||
      !input.range ||
      !sameRange(decoded.range, input.range))
  )
    throw mismatchedCursor()
  const cursor = decoded?.operation === 'read' ? decoded : null
  const source = await openDocumentSource(input.fileId, signal)
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
