import type { FileCollection, PreviewKind } from '../../core/files'
import type { FileRef } from '../../core/reader-state'

export type ReadRange = { unit: 'line' | 'page'; start: number; end: number }
export type ListInput = { path?: string; cursor?: string }
export type SearchInput = { query: string; fileId?: string; cursor?: string }
export type ReadInput = { fileId: string; range?: ReadRange; cursor?: string }
export type SourceLineRange = { unit: 'line'; start: number; end: number }
export type ReadActiveSourceInput = { range?: SourceLineRange; cursor?: string }
export type ReadActiveSourceResult = {
  fileId: string
  path: string
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
export type AnalyzeImageResult = { fileId: string; path: string; analysis: string }
export type FileEntry = FileRef & {
  collection: FileCollection
  type: PreviewKind
  textReadable: boolean
  reason?: string
}
export type FileIssue = { fileId: string; path: string; reason: string }
export type SearchMatch = {
  fileId: string
  path: string
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
  path: string
  range: ReadRange | null
  content: string
  next: ReadInput | null
  notice?: string
}
export class LocalToolError extends Error {}
