import type { FileCollection, PreviewKind } from './files'

export type ReadRange = { unit: 'line' | 'page'; start: number; end: number }
export type ListInput = { name?: string; cursor?: string }
export type SearchInput = { query: string; fileId?: string; cursor?: string }
export type ReadInput = { fileId: string; range?: ReadRange; cursor?: string }
export type SourceLineRange = { unit: 'line'; start: number; end: number }
export type ReadActiveSourceInput = { range?: SourceLineRange; cursor?: string }
export type ReadActiveSourceResult = {
  fileId: string
  name: string
  version: string
  range: SourceLineRange | null
  content: string
  next: ReadActiveSourceInput | null
}
export type EditActiveSourceInput = {
  fileId: string
  expectedVersion: string
  oldText: string
  newText: string
}
export type EditActiveSourceResult = { version: string }
export type AnalyzeImageInput = { fileId: string; question?: string }
export type AnalyzeImageResult = { fileId: string; name: string; analysis: string }
export type FileRef = { id: string; name: string }
export type ReaderState = {
  openFiles: FileRef[]
  activeFile: (FileRef & { pageNumber?: number; source?: { dirty: boolean } }) | null
  viewport: { startText: string; endText: string } | null
}
export type FileEntry = FileRef & {
  collection: FileCollection
  type: PreviewKind
  textReadable: boolean
  reason?: string
}
export type FileIssue = { fileId: string; name: string; reason: string }
export type SearchMatch = {
  fileId: string
  name: string
  range: ReadRange
  excerpt: string
}
export type ListResult = { files: FileEntry[]; next: ListInput | null }
export type SearchResult = {
  matches: SearchMatch[]
  issues: FileIssue[]
  next: SearchInput | null
}
export type ReadResult = {
  fileId: string
  name: string
  range: ReadRange | null
  content: string
  next: ReadInput | null
  notice?: string
}
export class LocalToolError extends Error {}
