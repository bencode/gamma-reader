import type { StoredFileMetadata } from '../../../core/files'
import { readSpreadsheet, sheetText, type Worksheet } from '../../../core/xlsx'
import type { DocumentSource } from '../document-tools'
import { LocalToolError } from '../tool-types'

type StoredXlsx = { metadata: StoredFileMetadata; blob: Blob }

// One agent run reads the same workbook repeatedly, and a sheet is the natural page:
// a search hit then names the sheet it came from.
export const createXlsxRuntime = () => {
  let current: { id: string; revision: number; sheets: readonly Worksheet[] } | undefined
  const dispose = () => {
    current = undefined
  }
  const openDocument = async (
    stored: StoredXlsx,
    signal?: AbortSignal,
  ): Promise<DocumentSource> => {
    signal?.throwIfAborted()
    const file = stored.metadata
    if (file.previewKind !== 'xlsx') throw new LocalToolError('This file is not a spreadsheet.')
    if (current?.id !== file.id || current.revision !== file.revision) {
      const sheets = await readSpreadsheet(stored.blob)
      signal?.throwIfAborted()
      current = { id: file.id, revision: file.revision, sheets }
    }
    const { sheets } = current
    return {
      file,
      unit: 'page',
      // A workbook always holds at least one sheet, and a page count of zero would leave
      // the read tool with no range to offer.
      pageCount: Math.max(1, sheets.length),
      readPage: async number => {
        const sheet = sheets[number - 1]
        return sheet ? sheetText(sheet) : ''
      },
      close: async () => {},
    }
  }
  return { openDocument, dispose }
}
export type XlsxRuntime = ReturnType<typeof createXlsxRuntime>
