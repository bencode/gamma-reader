import { LocalToolError } from '../../core/agent/tool'
import {
  maximumTextPreviewBytes,
  type PreviewKind,
  type StoredFileMetadata,
} from '../../core/files'
import { getStoredFile, listStoredFiles } from '../../data/file-store'
import { markdownText } from '../../formats/markdown-text'
import type { DocumentAccess } from './document-tools'
import { createDocxRuntime, type DocxRuntime } from './docx/runtime'
import type { PdfRuntime } from './pdf/runtime'
import { openTextSource } from './text-source'
import { createXlsxRuntime, type XlsxRuntime } from './xlsx/runtime'

// Converted formats read through their own runtimes; any other file is read as text when its bytes
// decode as UTF-8, so only the size of the decoded text needs a bound up front.
const convertedKinds = new Set<PreviewKind>(['pdf', 'docx', 'xlsx'])

const getReadability = (file: StoredFileMetadata) =>
  convertedKinds.has(file.previewKind) || file.size <= maximumTextPreviewBytes
    ? { textReadable: true }
    : { textReadable: false, reason: 'Text reading is limited to files of 5 MiB or less.' }

export const createReaderDocumentAccess = (
  pdf: PdfRuntime,
  docx: DocxRuntime = createDocxRuntime(),
  xlsx: XlsxRuntime = createXlsxRuntime(getStoredFile),
): DocumentAccess => ({
  listFiles: listStoredFiles,
  getReadability,
  open: async (fileId, signal) => {
    signal?.throwIfAborted()
    const stored = await getStoredFile(fileId)
    if (!stored)
      throw new LocalToolError('File removed or not found. Run list to choose an available file.')
    const { reason } = getReadability(stored.metadata)
    if (reason) throw new LocalToolError(reason)
    if (stored.metadata.previewKind === 'pdf') return pdf.openDocument(stored, signal)
    if (stored.metadata.previewKind === 'docx') return docx.openDocument(stored, signal)
    if (stored.metadata.previewKind === 'xlsx') return xlsx.openDocument(stored, signal)
    return openTextSource(
      stored.metadata,
      stored.blob,
      stored.metadata.previewKind === 'markdown' ? markdownText : undefined,
      signal,
    )
  },
})
