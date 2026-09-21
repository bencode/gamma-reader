import { markdownText } from '../../../core/document-text'
import { convertDocxToMarkdown } from '../../../core/docx'
import type { StoredFileMetadata } from '../../../core/files'
import type { DocumentSource } from '../document-tools'
import { LocalToolError } from '../tool-types'

type StoredDocx = { metadata: StoredFileMetadata; blob: Blob }

// Converting a Word document is expensive, and one agent run reads the same file repeatedly.
export const createDocxRuntime = () => {
  let current: { id: string; revision: number; text: string } | undefined
  const dispose = () => {
    current = undefined
  }
  const openDocument = async (
    stored: StoredDocx,
    signal?: AbortSignal,
  ): Promise<DocumentSource> => {
    signal?.throwIfAborted()
    const file = stored.metadata
    if (file.previewKind !== 'docx') throw new LocalToolError('This file is not a Word document.')
    if (current?.id !== file.id || current.revision !== file.revision) {
      const { markdown, warnings } = await convertDocxToMarkdown(stored.blob, { images: false })
      signal?.throwIfAborted()
      if (warnings.length) console.warn(`Unconverted content in ${file.name}`, warnings)
      current = { id: file.id, revision: file.revision, text: markdownText(markdown) }
    }
    const { text } = current
    return {
      file,
      unit: 'line',
      pageCount: 1,
      readPage: async () => text,
      close: async () => {},
    }
  }
  return { openDocument, dispose }
}
export type DocxRuntime = ReturnType<typeof createDocxRuntime>
