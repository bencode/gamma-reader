import type { PreviewKind } from './files'

// The format travels with the reference so the assistant knows which tools fit the open file.
export type FileRef = { id: string; name: string; type: PreviewKind }
export type ReaderState = {
  openFiles: FileRef[]
  activeFile: (FileRef & { pageNumber?: number; source?: { dirty: boolean } }) | null
  viewport: { startText: string; endText: string } | null
}
