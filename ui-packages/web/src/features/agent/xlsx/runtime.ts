import type { StoredFileMetadata } from '../../../core/files'
import { readSpreadsheet, type Worksheet, workbookText } from '../../../core/xlsx'
import type { DocumentSource } from '../document-tools'
import { LocalToolError } from '../tool-types'

type StoredXlsx = { metadata: StoredFileMetadata; blob: Blob }
type FileLoader = (id: string) => Promise<StoredXlsx | null>

type LoadedWorkbook = {
  id: string
  revision: number
  sheets: readonly Worksheet[]
  text?: string
}

// One agent run reads the same workbook repeatedly, so it is parsed once and kept until the
// run ends. The line-addressable text is built only if a tool asks for it.
export const createXlsxRuntime = (loadFile: FileLoader) => {
  let current: LoadedWorkbook | undefined
  const dispose = () => {
    current = undefined
  }

  const load = async (stored: StoredXlsx, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const file = stored.metadata
    if (file.previewKind !== 'xlsx') throw new LocalToolError('This file is not a spreadsheet.')
    if (current?.id !== file.id || current.revision !== file.revision) {
      const sheets = await readSpreadsheet(stored.blob)
      signal?.throwIfAborted()
      current = { id: file.id, revision: file.revision, sheets }
    }
    return current
  }

  const openDocument = async (
    stored: StoredXlsx,
    signal?: AbortSignal,
  ): Promise<DocumentSource> => {
    const workbook = await load(stored, signal)
    return {
      file: stored.metadata,
      // Rows are lines, so read reaches any row directly and search reports every match.
      unit: 'line',
      pageCount: 1,
      readPage: async () => (workbook.text ??= workbookText(workbook.sheets)),
      close: async () => {},
    }
  }

  const sheets = async (fileId: string, signal?: AbortSignal) => {
    const stored = await loadFile(fileId)
    if (!stored)
      throw new LocalToolError('File removed or not found. Run list to choose an available file.')
    return (await load(stored, signal)).sheets
  }

  return { openDocument, sheets, dispose }
}
export type XlsxRuntime = ReturnType<typeof createXlsxRuntime>
