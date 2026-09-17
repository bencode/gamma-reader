import type { StoredFileMetadata } from '../../../core/files'
import type { DocumentSource } from '../document-tools'
import {
  boundedText,
  changedFile,
  decodeCursor,
  encodeCursor,
  fitsResult,
  integer,
  mismatchedCursor,
  record,
} from '../pagination'
import { LocalToolError } from '../tool-types'
import type { PdfSource } from './source'
import type { PdfInfoResult, PdfOutlineEntry, PdfOutlineInput, PdfOutlineResult } from './types'

type StoredPdf = { metadata: StoredFileMetadata; blob: Blob }
type FileLoader = (id: string) => Promise<StoredPdf | null>
type OutlineCursor = { fileId: string; revision: number; index: number }
const validCursor = (value: unknown): value is OutlineCursor =>
  record(value) &&
  typeof value.fileId === 'string' &&
  integer(value.revision, 1) &&
  integer(value.index, 0)

function* outlineEntries(
  items: unknown,
  depth = 0,
): Generator<{ title: string; depth: number; destination: unknown }> {
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (!record(item)) continue
    yield {
      title: typeof item.title === 'string' ? item.title : 'Untitled section',
      depth,
      destination: item.dest,
    }
    yield* outlineEntries(item.items, depth + 1)
  }
}

export const createPdfRuntime = (loadFile: FileLoader) => {
  let current: { id: string; revision: number; source: PdfSource } | undefined
  const dispose = async () => {
    const previous = current
    current = undefined
    await previous?.source.destroy()
  }
  const open = async (stored: StoredPdf, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const file = stored.metadata
    if (file.previewKind !== 'pdf') throw new LocalToolError('This file is not a PDF.')
    if (current?.id === file.id && current.revision === file.revision && !current.source.destroyed)
      return current.source
    await dispose()
    const { openPdfSource } = await import('./source')
    const source = await openPdfSource(stored.blob, signal)
    current = { id: file.id, revision: file.revision, source }
    return source
  }
  const get = async (fileId: string, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const stored = await loadFile(fileId)
    if (!stored) {
      if (current?.id === fileId) await dispose()
      throw new LocalToolError('File removed or not found. Run list to choose an available file.')
    }
    return { file: stored.metadata, source: await open(stored, signal) }
  }
  const openDocument = async (stored: StoredPdf, signal?: AbortSignal): Promise<DocumentSource> => {
    const source = await open(stored, signal)
    return {
      file: stored.metadata,
      unit: 'page',
      pageCount: source.pageCount,
      readPage: number => source.readPage(number, signal),
      // Page resources are released by the source; the document belongs to the agent run.
      close: async () => {},
    }
  }
  const info = async (fileId: string, signal?: AbortSignal): Promise<PdfInfoResult> => {
    const { source } = await get(fileId, signal)
    return source.withDocument(async pdf => {
      const { info: metadata } = await pdf.getMetadata()
      const values = record(metadata) ? metadata : {}
      return {
        fileId,
        pageCount: pdf.numPages,
        ...(typeof values.Title === 'string' ? { title: boundedText(values.Title, 1024) } : {}),
        ...(typeof values.Author === 'string' ? { author: boundedText(values.Author, 1024) } : {}),
      }
    }, signal)
  }
  const outline = async (
    input: PdfOutlineInput,
    signal?: AbortSignal,
  ): Promise<PdfOutlineResult> => {
    const cursor = decodeCursor(input.cursor, validCursor)
    if (cursor && cursor.fileId !== input.fileId) throw mismatchedCursor()
    const { file, source } = await get(input.fileId, signal)
    if (cursor && cursor.revision !== file.revision) throw changedFile()
    return source.withDocument(async pdf => {
      const result: PdfOutlineResult = { fileId: file.id, entries: [], next: null }
      let index = 0
      for (const item of outlineEntries(await pdf.getOutline())) {
        if (index++ < (cursor?.index ?? 0)) continue
        signal?.throwIfAborted()
        let pageNumber: number | null = null
        const destination: unknown =
          typeof item.destination === 'string'
            ? await pdf.getDestination(item.destination)
            : item.destination
        if (Array.isArray(destination)) {
          const reference: unknown = destination[0]
          const page =
            typeof reference === 'number' && integer(reference, 0)
              ? reference + 1
              : record(reference) && integer(reference.num, 0) && integer(reference.gen, 0)
                ? (await pdf.getPageIndex({
                    num: Number(reference.num),
                    gen: Number(reference.gen),
                  })) + 1
                : null
          if (page !== null && page <= pdf.numPages) pageNumber = page
        }
        const entry: PdfOutlineEntry = { title: item.title, depth: item.depth, pageNumber }
        const next = {
          fileId: file.id,
          cursor: encodeCursor({ fileId: file.id, revision: file.revision, index: index - 1 }),
        }
        if (
          result.entries.length >= 100 ||
          !fitsResult({ ...result, entries: [...result.entries, entry], next })
        ) {
          if (!result.entries.length)
            throw new LocalToolError('PDF outline entry exceeds the result limit.')
          return { ...result, next }
        }
        result.entries.push(entry)
      }
      if ((cursor?.index ?? 0) > index) throw mismatchedCursor()
      return result
    }, signal)
  }
  const renderPage = async (fileId: string, pageNumber: number, signal?: AbortSignal) => {
    const { source } = await get(fileId, signal)
    if (!integer(pageNumber, 1) || pageNumber > source.pageCount)
      throw new LocalToolError(`Use a page number between 1 and ${source.pageCount}.`)
    return source.renderPage(pageNumber, signal)
  }
  return { openDocument, info, outline, renderPage, dispose }
}
export type PdfRuntime = ReturnType<typeof createPdfRuntime>
