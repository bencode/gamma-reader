import type { ProjectSource } from '../../core/projects'

// What a remote source serves: one listing, and each file under its path. Versions are opaque;
// they only have to change when the content does.
export type SourceFile = { path: string; version: string; size: number }
export type SourceListing = { version: string; files: SourceFile[] }

const isSourceFile = (value: unknown): value is SourceFile =>
  typeof value === 'object' &&
  value !== null &&
  'path' in value &&
  typeof value.path === 'string' &&
  'version' in value &&
  typeof value.version === 'string' &&
  'size' in value &&
  typeof value.size === 'number'

export const isSourceListing = (value: unknown): value is SourceListing =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  typeof value.version === 'string' &&
  'files' in value &&
  Array.isArray(value.files) &&
  value.files.every(isSourceFile)

export const isProjectSource = (value: unknown): value is ProjectSource =>
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  typeof value.name === 'string' &&
  'url' in value &&
  typeof value.url === 'string'

export const sourceFileUrl = (source: ProjectSource, path: string) =>
  `${source.url.replace(/\/$/, '')}/files/${path.split('/').map(encodeURIComponent).join('/')}`

export const sourceSaveUrl = (source: ProjectSource) => `${source.url.replace(/\/$/, '')}/save`

// A failure the source explains, as opposed to one it could not be reached for.
export class SourceError extends Error {}

export type SkipReason =
  | 'deleted-on-disk'
  | 'changed-on-disk'
  | 'missing'
  | 'path-taken'
  | 'cannot-merge'
  | 'invalid-path'
  | 'failed'

// What a writable source did with each saved change, in the order it applied them.
export type SaveResult =
  | { kind: 'written'; path: string; version: string }
  | { kind: 'merged'; path: string; version: string; conflicts: number }
  | { kind: 'moved'; from: string; path: string }
  | { kind: 'deleted'; path: string }
  | { kind: 'skipped'; path: string; reason: SkipReason }

const skipReasons = new Set<string>([
  'deleted-on-disk',
  'changed-on-disk',
  'missing',
  'path-taken',
  'cannot-merge',
  'invalid-path',
  'failed',
])

export const isSaveResult = (value: unknown): value is SaveResult => {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false
  const result = value as Record<string, unknown>
  if (typeof result.path !== 'string') return false
  if (result.kind === 'written') return typeof result.version === 'string'
  if (result.kind === 'merged')
    return typeof result.version === 'string' && typeof result.conflicts === 'number'
  if (result.kind === 'moved') return typeof result.from === 'string'
  if (result.kind === 'deleted') return true
  return (
    result.kind === 'skipped' && typeof result.reason === 'string' && skipReasons.has(result.reason)
  )
}
