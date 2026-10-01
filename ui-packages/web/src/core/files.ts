export const maximumFileBytes = 200 * 1024 * 1024
export const maximumLibraryBytes = 1024 * 1024 * 1024
export const maximumTextPreviewBytes = 5 * 1024 * 1024

export type PreviewKind =
  | 'markdown'
  | 'text'
  | 'pdf'
  | 'html'
  | 'image'
  | 'docx'
  | 'xlsx'
  | 'unsupported'
export type FileCollection = 'files' | 'attachments'

export type StoredFileMetadata = {
  id: string
  path: string
  collection?: FileCollection
  mediaType: string
  previewKind: PreviewKind
  size: number
  lastModified: number
  createdAt: number
  revision: number
}

export type StoredFileContent = { id: string; blob: Blob }

export type ImportRejectionReason =
  | 'file-too-large'
  | 'library-full'
  | 'storage-unavailable'
  | 'invalid-path'
  | 'path-conflict'

export type ImportSource = { path: string; file: File }

export type ImportedFile = {
  sourceIndex: number
  metadata: StoredFileMetadata
  action: 'added' | 'replaced'
}

export type ImportResult = {
  addedIds: string[]
  replacedIds: string[]
  imported: ImportedFile[]
  rejected: Array<{ sourceIndex: number; path: string; reason: ImportRejectionReason }>
}

// Only the file name counts, so a dot in a folder name is never read as an extension.
const extensionOf = (path: string) =>
  baseName(path)
    .toLowerCase()
    .match(/\.([^.]+)$/)?.[1] ?? ''
const imageExtensions = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
// Plain text in its many dialects: notes, data and configuration, and source code.
const textExtensions = new Set(
  [
    'conf csv ini json jsonl log rst text toml txt xml yaml yml',
    'ts tsx js jsx mjs cjs py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh fish',
    'sql css scss less vue svelte lua dart scala clj cljs cljc edn el lisp scm rkt hs ml ex exs',
    'erl r jl gradle properties env lock diff patch',
  ].flatMap(line => line.split(' ')),
)
// Files a project keeps as text without an extension.
const textFileNames = new Set([
  'changelog',
  'dockerfile',
  'gemfile',
  'license',
  'makefile',
  'procfile',
  'readme',
])
const docxMediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const xlsxMediaType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const textMediaTypes = new Set([
  'application/json',
  'application/toml',
  'application/xml',
  'application/yaml',
])

export const previewKindFor = (name: string, mediaType: string): PreviewKind => {
  const extension = extensionOf(name)
  if (extension === 'md' || extension === 'markdown' || mediaType === 'text/markdown')
    return 'markdown'
  if (
    textExtensions.has(extension) ||
    textMediaTypes.has(mediaType) ||
    textFileNames.has(baseName(name).toLowerCase())
  )
    return 'text'
  if (extension === 'pdf' || mediaType === 'application/pdf') return 'pdf'
  if (extension === 'docx' || mediaType === docxMediaType) return 'docx'
  if (extension === 'xlsx' || mediaType === xlsxMediaType) return 'xlsx'
  if (extension === 'html' || extension === 'htm' || mediaType === 'text/html') return 'html'
  if (imageExtensions.has(extension) || mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('text/')) return 'text'
  return 'unsupported'
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const maximumPathLength = 1024

export const containsControlCharacter = (value: string) =>
  Array.from(value).some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
  })

// A path is relative and every '/'-separated segment names something. Any character a file
// name may hold is allowed, so files imported from disk keep their names. Paths are checked and
// never rewritten, so every caller agrees on which file a path means.
export const isWorkspacePath = (path: string) =>
  path.length > 0 &&
  path.length <= maximumPathLength &&
  !path.startsWith('/') &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// Files chosen or dropped one by one land in the library root under their own names.
export const rootSources = (files: readonly File[]): ImportSource[] =>
  files.map(file => ({ path: file.name, file }))

export const duplicatePaths = (
  sources: readonly ImportSource[],
  existing: readonly StoredFileMetadata[],
) => {
  const paths = new Set(existing.map(file => file.path.toLowerCase()))
  return sources.reduce<string[]>((duplicates, { path }) => {
    const normalized = path.toLowerCase()
    if (paths.has(normalized) && !duplicates.includes(path)) duplicates.push(path)
    paths.add(normalized)
    return duplicates
  }, [])
}
