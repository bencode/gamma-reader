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
  name: string
  collection?: FileCollection
  mediaType: string
  previewKind: PreviewKind
  size: number
  lastModified: number
  createdAt: number
  revision: number
}

export type StoredFileContent = { id: string; blob: Blob }

export type ImportRejectionReason = 'file-too-large' | 'library-full' | 'storage-unavailable'

export type ImportedFile = {
  sourceIndex: number
  metadata: StoredFileMetadata
  action: 'added' | 'replaced'
}

export type ImportResult = {
  addedIds: string[]
  replacedIds: string[]
  imported: ImportedFile[]
  rejected: Array<{ sourceIndex: number; name: string; reason: ImportRejectionReason }>
}

const extensionOf = (name: string) => name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? ''
const imageExtensions = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const textExtensions = new Set([
  'conf',
  'csv',
  'ini',
  'json',
  'jsonl',
  'log',
  'rst',
  'text',
  'toml',
  'txt',
  'xml',
  'yaml',
  'yml',
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
  if (textExtensions.has(extension) || textMediaTypes.has(mediaType)) return 'text'
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

export const duplicateNames = (files: readonly File[], existing: readonly StoredFileMetadata[]) => {
  const names = new Set(existing.map(file => file.name.toLowerCase()))
  return files.reduce<string[]>((duplicates, file) => {
    const normalized = file.name.toLowerCase()
    if (names.has(normalized) && !duplicates.includes(file.name)) duplicates.push(file.name)
    names.add(normalized)
    return duplicates
  }, [])
}
