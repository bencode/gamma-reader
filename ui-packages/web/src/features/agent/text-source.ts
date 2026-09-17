import { normalizeNewlines } from '../../core/document-text'
import { maximumTextPreviewBytes, type StoredFileMetadata } from '../../core/files'
import type { DocumentSource } from './document-tools'
import { LocalToolError } from './tool-types'

export const openTextSource = async (
  file: StoredFileMetadata,
  blob: Blob,
  transform: (text: string) => string = normalizeNewlines,
  signal?: AbortSignal,
): Promise<DocumentSource> => {
  signal?.throwIfAborted()
  if (file.size > maximumTextPreviewBytes)
    throw new LocalToolError('Text reading is limited to files of 5 MiB or less.')
  const bytes = await blob.arrayBuffer()
  signal?.throwIfAborted()
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause
    throw new LocalToolError('This file is not valid UTF-8. Import a UTF-8 copy.', { cause })
  }
  const content = transform(text)
  return { file, unit: 'line', pageCount: 1, readPage: async () => content, close: async () => {} }
}
