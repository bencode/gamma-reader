import type { PreviewKind } from './files'

// The format travels with the reference so the assistant knows which tools fit the open file.
export type FileRef = { id: string; path: string; type: PreviewKind }
export type ReaderState = {
  openFiles: FileRef[]
  activeFile: (FileRef & { pageNumber?: number; source?: { dirty: boolean } }) | null
  // A page no note holds, when that is what the reader has open; activeFile is null then.
  activePage?: string
  viewport: { startText: string; endText: string } | null
}
