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
