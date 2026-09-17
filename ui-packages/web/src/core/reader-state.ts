export type FileRef = { id: string; name: string }
export type ReaderState = {
  openFiles: FileRef[]
  activeFile: (FileRef & { pageNumber?: number; source?: { dirty: boolean } }) | null
  viewport: { startText: string; endText: string } | null
}
