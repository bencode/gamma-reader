import { nanoid } from 'nanoid'
import {
  baseName,
  type FileCollection,
  type ImportResult,
  type ImportSource,
  isWorkspacePath,
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

export type UpdateStoredTextFileResult =
  | { status: 'saved'; metadata: StoredFileMetadata }
  | { status: 'conflict' }
  | { status: 'missing' }
  | { status: 'rejected'; reason: ImportResult['rejected'][number]['reason'] }

const openFileDatabase = openWorkspaceDatabase

const svgMediaType = 'image/svg+xml'
const isSvg = (name: string) => name.toLowerCase().endsWith('.svg')
const storedBlob = (metadata: StoredFileMetadata | undefined, blob: Blob) =>
  metadata && isSvg(metadata.path) && blob.type !== svgMediaType
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
  if (!content) throw new Error(`Stored file content is missing: ${metadata.path}`)
  return { metadata, blob: storedBlob(metadata, content.blob) }
}

// Only the file name takes the number, so a dot in a folder name never splits the path.
const nextPath = (requested: string, occupied: ReadonlyMap<string, unknown>) => {
  const folder = requested.slice(0, requested.length - baseName(requested).length)
  const name = baseName(requested)
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? name.slice(0, dot) : name
  const extension = hasExtension ? name.slice(dot) : ''
  let number = 2
  let candidate = `${folder}${stem} (${number})${extension}`
  while (occupied.has(candidate.toLowerCase())) {
    number += 1
    candidate = `${folder}${stem} (${number})${extension}`
  }
  return candidate
}

// The folders a path lies in, outermost first: 'a/b/c.md' → ['a', 'a/b'].
const folderKeys = (key: string) => {
  const segments = key.split('/')
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'))
}

// Every folder the given file keys imply, so a path is checked against the depth of its own
// folders rather than against every other path.
const folderIndex = (keys: Iterable<string>) => {
  const folders = new Set<string>()
  for (const key of keys) for (const folder of folderKeys(key)) folders.add(folder)
  return folders
}

// A path cannot name a file and a folder at once: one may not lie inside the other.
const shadows = (
  key: string,
  files: { has: (key: string) => boolean },
  folders: ReadonlySet<string>,
) => folders.has(key) || folderKeys(key).some(folder => files.has(folder))

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
  selected: readonly ImportSource[],
  duplicateMode: DuplicateMode,
  collection: FileCollection = 'files',
  signal?: AbortSignal,
): Promise<ImportResult> => {
  signal?.throwIfAborted()
  const database = await openFileDatabase()
  const existing = await database.getAllFromIndex('files', 'by-created-at')
  const existingIds = new Set(existing.map(file => file.id))
  const planned = new Map(existing.map(file => [file.path.toLowerCase(), file]))
  const folders = folderIndex(planned.keys())
  const writes = new Map<string, PlannedWrite>()
  const rejected: ImportResult['rejected'] = []
  let totalBytes = existing.reduce((total, file) => total + file.size, 0)
  const createdAt = Date.now()

  selected.forEach(({ path: requested, file }, index) => {
    const duplicate = planned.get(requested.toLowerCase())
    const path = duplicate && duplicateMode === 'keep' ? nextPath(requested, planned) : requested
    const reason = !isWorkspacePath(requested)
      ? 'invalid-path'
      : file.size > maximumFileBytes
        ? 'file-too-large'
        : shadows(path.toLowerCase(), planned, folders)
          ? 'path-conflict'
          : null
    if (reason) {
      rejected.push({ sourceIndex: index, path: requested, reason })
      return
    }
    const replaced = duplicate !== undefined && duplicateMode === 'replace'
    const id = replaced ? duplicate.id : nanoid()
    const previousSize = replaced ? duplicate.size : 0
    if (totalBytes - previousSize + file.size > maximumLibraryBytes) {
      rejected.push({ sourceIndex: index, path: requested, reason: 'library-full' })
      return
    }
    const metadata: StoredFileMetadata = {
      id,
      path,
      collection,
      mediaType: file.type || 'application/octet-stream',
      previewKind: previewKindFor(path, file.type),
      size: file.size,
      lastModified: file.lastModified,
      createdAt: replaced ? duplicate.createdAt : createdAt + index,
      revision: replaced ? duplicate.revision + 1 : 1,
    }
    totalBytes += file.size - previousSize
    planned.set(path.toLowerCase(), metadata)
    for (const folder of folderKeys(path.toLowerCase())) folders.add(folder)
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
          path: write.metadata.path,
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
            path: write.metadata.path,
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
  if (reason === 'file-too-large') return new Error('The file exceeds the 200 MiB file limit.')
  if (reason === 'library-full') return new Error('The file exceeds the 1 GiB library limit.')
  if (reason === 'invalid-path')
    return new Error('Use a relative path whose segments are not empty, "." or "..".')
  if (reason === 'path-conflict')
    return new Error('The path would place a file where a folder is, or inside a file.')
  return new Error('The file does not fit in browser storage.')
}

// A file the library already has at that path, which an addition must not replace.
export class FileExistsError extends Error {}

// Adds a file at a path the library does not hold yet; the caller chooses another path otherwise.
export const addStoredFile = async (path: string, file: File, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const taken = (await listStoredFiles()).some(
    existing => existing.path.toLowerCase() === path.toLowerCase(),
  )
  if (taken) throw new FileExistsError(`A file already exists at ${path}. Choose another path.`)
  const result = await importStoredFiles([{ path, file }], 'replace', 'files', signal)
  const added = result.imported[0]?.metadata
  if (added) return added
  const rejected = result.rejected[0]
  throw rejected ? writeError(rejected.reason) : new Error('The file could not be added.')
}

export const writeStoredTextFile = async (path: string, content: string, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const existing = (await listStoredFiles()).find(
    file => file.path.toLowerCase() === path.toLowerCase(),
  )
  const file = new File([content], baseName(path), {
    type: isSvg(path) ? svgMediaType : 'text/plain;charset=utf-8',
    lastModified: Date.now(),
  })
  const result = await importStoredFiles(
    [{ path, file }],
    'replace',
    existing?.collection ?? 'files',
    signal,
  )
  const written = result.imported[0]?.metadata
  if (written) return written
  const rejected = result.rejected[0]
  throw rejected ? writeError(rejected.reason) : new Error('The file could not be written.')
}

export const updateStoredTextFile = async (
  id: string,
  expectedRevision: number,
  content: string,
  signal?: AbortSignal,
): Promise<UpdateStoredTextFileResult> => {
  signal?.throwIfAborted()
  const database = await openFileDatabase()
  const files = await database.getAllFromIndex('files', 'by-created-at')
  const existing = files.find(file => file.id === id)
  if (!existing) return { status: 'missing' }
  const blob = new Blob([content], { type: existing.mediaType })
  if (blob.size > maximumFileBytes) return { status: 'rejected', reason: 'file-too-large' }
  const libraryBytes = files.reduce((total, file) => total + file.size, 0)
  if (libraryBytes - existing.size + blob.size > maximumLibraryBytes)
    return { status: 'rejected', reason: 'library-full' }
  if (!(await hasBrowserCapacity(Math.max(0, blob.size - existing.size))))
    return { status: 'rejected', reason: 'storage-unavailable' }

  signal?.throwIfAborted()
  try {
    const transaction = database.transaction(['files', 'contents'], 'readwrite')
    const abort = () => transaction.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const current = await transaction.objectStore('files').get(id)
      if (!current) {
        await transaction.done
        return { status: 'missing' }
      }
      if (current.revision !== expectedRevision) {
        await transaction.done
        return { status: 'conflict' }
      }
      const metadata: StoredFileMetadata = {
        ...current,
        size: blob.size,
        lastModified: Date.now(),
        revision: current.revision + 1,
      }
      await Promise.all([
        transaction.objectStore('files').put(metadata),
        transaction.objectStore('contents').put({ id, blob }),
        transaction.done,
      ])
      return { status: 'saved', metadata }
    } finally {
      signal?.removeEventListener('abort', abort)
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      return { status: 'rejected', reason: 'storage-unavailable' }
    throw error
  }
}

export type MoveRejectionReason =
  | 'missing'
  | 'invalid-path'
  | 'path-taken'
  | 'path-conflict'
  | 'attachment'

const moveMessages: Record<MoveRejectionReason, string> = {
  missing: 'The file is no longer in the workspace.',
  'invalid-path': 'Use a relative path whose segments are not empty, "." or "..".',
  'path-taken': 'Another file already has that path. Choose another path or ask the reader first.',
  'path-conflict': 'The path would place a file where a folder is, or inside a file.',
  attachment: 'Chat attachments stay where they are and cannot be moved.',
}

export class MoveRejectedError extends Error {
  constructor(readonly reason: MoveRejectionReason) {
    super(moveMessages[reason])
  }
}

// Moving changes where a file lives, not what it holds, so the revision stays: a source draft
// saved later still matches the file it was read from.
export const moveStoredFile = async (id: string, path: string, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  const database = await openFileDatabase()
  const transaction = database.transaction('files', 'readwrite')
  const files = transaction.objectStore('files')
  const all = await files.getAll()
  const current = all.find(file => file.id === id)
  const others = new Set(all.filter(file => file.id !== id).map(file => file.path.toLowerCase()))
  const key = path.toLowerCase()
  const reason: MoveRejectionReason | null = !current
    ? 'missing'
    : current.collection === 'attachments'
      ? 'attachment'
      : !isWorkspacePath(path)
        ? 'invalid-path'
        : others.has(key)
          ? 'path-taken'
          : shadows(key, others, folderIndex(others))
            ? 'path-conflict'
            : null
  if (reason || !current) {
    await transaction.done
    throw new MoveRejectedError(reason ?? 'missing')
  }
  signal?.throwIfAborted()
  const metadata: StoredFileMetadata = {
    ...current,
    path,
    previewKind: previewKindFor(path, current.mediaType),
  }
  await Promise.all([files.put(metadata), transaction.done])
  return { from: current.path, metadata }
}

// Files leave together or not at all, so removing a folder never leaves part of it behind.
export const removeStoredFiles = async (ids: readonly string[]) => {
  const database = await openFileDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readwrite')
  await Promise.all([
    ...ids.flatMap(id => [
      transaction.objectStore('files').delete(id),
      transaction.objectStore('contents').delete(id),
    ]),
    transaction.done,
  ])
}
