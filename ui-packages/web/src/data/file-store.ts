import {
  type FileCollection,
  type ImportResult,
  maximumFileBytes,
  maximumLibraryBytes,
  previewKindFor,
  type StoredFileContent,
  type StoredFileMetadata,
} from '../core/files'
import {
  closeWorkspaceDatabase,
  deleteWorkspaceDatabase,
  openWorkspaceDatabase,
} from './workspace-database'

export type DuplicateMode = 'replace' | 'keep'

const openFileDatabase = openWorkspaceDatabase

const svgMediaType = 'image/svg+xml'
const isSvg = (name: string) => name.toLowerCase().endsWith('.svg')
const storedBlob = (metadata: StoredFileMetadata | undefined, blob: Blob) =>
  metadata && isSvg(metadata.name) && blob.type !== svgMediaType
    ? new Blob([blob], { type: svgMediaType })
    : blob

export const closeFileStore = closeWorkspaceDatabase
export const deleteFileStore = deleteWorkspaceDatabase

export const listStoredFiles = async () => {
  const database = await openFileDatabase()
  return database.getAllFromIndex('files', 'by-created-at')
}

export const getStoredFileContent = async (id: string) => {
  const database = await openFileDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readonly')
  const [metadata, content] = await Promise.all([
    transaction.objectStore('files').get(id),
    transaction.objectStore('contents').get(id),
    transaction.done,
  ])
  return content ? storedBlob(metadata, content.blob) : null
}

export const getStoredFile = async (id: string) => {
  const database = await openFileDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readonly')
  const [metadata, content] = await Promise.all([
    transaction.objectStore('files').get(id),
    transaction.objectStore('contents').get(id),
    transaction.done,
  ])
  if (!metadata) return null
  if (!content) throw new Error(`Stored file content is missing: ${metadata.name}`)
  return { metadata, blob: storedBlob(metadata, content.blob) }
}

const nextName = (requested: string, occupied: Set<string>) => {
  const dot = requested.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? requested.slice(0, dot) : requested
  const extension = hasExtension ? requested.slice(dot) : ''
  let number = 2
  let candidate = `${stem} (${number})${extension}`
  while (occupied.has(candidate.toLowerCase())) {
    number += 1
    candidate = `${stem} (${number})${extension}`
  }
  return candidate
}

const hasBrowserCapacity = async (bytes: number) => {
  if (bytes <= 0 || !navigator.storage?.estimate) return true
  try {
    const { quota, usage } = await navigator.storage.estimate()
    return quota === undefined || usage === undefined || quota - usage >= bytes
  } catch (error) {
    console.error('Unable to estimate browser storage', error)
    return true
  }
}

type PlannedWrite = {
  sourceIndex: number
  metadata: StoredFileMetadata
  content: StoredFileContent
}

export const importStoredFiles = async (
  selected: readonly File[],
  duplicateMode: DuplicateMode,
  collection: FileCollection = 'files',
  signal?: AbortSignal,
): Promise<ImportResult> => {
  signal?.throwIfAborted()
  const database = await openFileDatabase()
  const existing = await database.getAllFromIndex('files', 'by-created-at')
  const existingIds = new Set(existing.map(file => file.id))
  const planned = new Map(existing.map(file => [file.name.toLowerCase(), file]))
  const writes = new Map<string, PlannedWrite>()
  const rejected: ImportResult['rejected'] = []
  let totalBytes = existing.reduce((total, file) => total + file.size, 0)
  const createdAt = Date.now()

  selected.forEach((file, index) => {
    if (file.size > maximumFileBytes) {
      rejected.push({ sourceIndex: index, name: file.name, reason: 'file-too-large' })
      return
    }
    const requestedKey = file.name.toLowerCase()
    const duplicate = planned.get(requestedKey)
    const name =
      duplicate && duplicateMode === 'keep'
        ? nextName(file.name, new Set(planned.keys()))
        : file.name
    const replaced = duplicate !== undefined && duplicateMode === 'replace'
    const id = replaced ? duplicate.id : crypto.randomUUID()
    const previousSize = replaced ? duplicate.size : 0
    if (totalBytes - previousSize + file.size > maximumLibraryBytes) {
      rejected.push({ sourceIndex: index, name: file.name, reason: 'library-full' })
      return
    }
    const metadata: StoredFileMetadata = {
      id,
      name,
      collection,
      mediaType: file.type || 'application/octet-stream',
      previewKind: previewKindFor(name, file.type),
      size: file.size,
      lastModified: file.lastModified,
      createdAt: replaced ? duplicate.createdAt : createdAt + index,
      revision: replaced ? duplicate.revision + 1 : 1,
    }
    totalBytes += file.size - previousSize
    planned.set(name.toLowerCase(), metadata)
    writes.set(id, {
      sourceIndex: index,
      metadata,
      content: { id, blob: file.slice(0, file.size, file.type) },
    })
  })

  const addedBytes = totalBytes - existing.reduce((total, file) => total + file.size, 0)
  const plannedWrites = [...writes.values()]
  if (!(await hasBrowserCapacity(addedBytes))) {
    return {
      addedIds: [],
      replacedIds: [],
      imported: [],
      rejected: [
        ...rejected,
        ...plannedWrites.map(write => ({
          sourceIndex: write.sourceIndex,
          name: write.metadata.name,
          reason: 'storage-unavailable' as const,
        })),
      ],
    }
  }

  signal?.throwIfAborted()
  try {
    const transaction = database.transaction(['files', 'contents'], 'readwrite')
    const abort = () => transaction.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      await Promise.all([
        ...plannedWrites.flatMap(write => [
          transaction.objectStore('files').put(write.metadata),
          transaction.objectStore('contents').put(write.content),
        ]),
        transaction.done,
      ])
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      return {
        addedIds: [],
        replacedIds: [],
        imported: [],
        rejected: [
          ...rejected,
          ...plannedWrites.map(write => ({
            sourceIndex: write.sourceIndex,
            name: write.metadata.name,
            reason: 'storage-unavailable' as const,
          })),
        ],
      }
    throw error
  }

  const imported = plannedWrites.map(write => ({
    sourceIndex: write.sourceIndex,
    metadata: write.metadata,
    action: existingIds.has(write.metadata.id) ? ('replaced' as const) : ('added' as const),
  }))
  return {
    addedIds: imported.filter(item => item.action === 'added').map(item => item.metadata.id),
    replacedIds: imported.filter(item => item.action === 'replaced').map(item => item.metadata.id),
    imported,
    rejected,
  }
}

const writeError = (reason: ImportResult['rejected'][number]['reason']) => {
  if (reason === 'file-too-large') return new Error('The file exceeds the 50 MB file limit.')
  if (reason === 'library-full') return new Error('The file exceeds the 500 MB library limit.')
  return new Error('The file does not fit in browser storage.')
}

export const writeStoredTextFile = async (name: string, content: string, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const existing = (await listStoredFiles()).find(
    file => file.name.toLowerCase() === name.toLowerCase(),
  )
  const file = new File([content], name, {
    type: isSvg(name) ? svgMediaType : 'text/plain;charset=utf-8',
    lastModified: Date.now(),
  })
  const result = await importStoredFiles([file], 'replace', existing?.collection ?? 'files', signal)
  const written = result.imported[0]?.metadata
  if (written) return written
  const rejected = result.rejected[0]
  throw rejected ? writeError(rejected.reason) : new Error('The file could not be written.')
}

export const removeStoredFile = async (id: string) => {
  const database = await openFileDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readwrite')
  await Promise.all([
    transaction.objectStore('files').delete(id),
    transaction.objectStore('contents').delete(id),
    transaction.done,
  ])
}
