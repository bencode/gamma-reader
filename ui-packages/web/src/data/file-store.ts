import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import {
  type FileCollection,
  type ImportResult,
  maximumFileBytes,
  maximumLibraryBytes,
  previewKindFor,
  type StoredFileContent,
  type StoredFileMetadata,
} from '../core/files'
import { samples } from '../core/samples'

type FileDatabase = DBSchema & {
  files: {
    key: string
    value: StoredFileMetadata
    indexes: { 'by-created-at': number }
  }
  contents: { key: string; value: StoredFileContent }
}

export type DuplicateMode = 'replace' | 'keep'

const databaseName = 'gamma-reader-files'
let databasePromise: Promise<IDBPDatabase<FileDatabase>> | undefined

const openFileDatabase = () => {
  databasePromise ??= openDB<FileDatabase>(databaseName, 2, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const files = database.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        const contents = database.createObjectStore('contents', { keyPath: 'id' })
        samples.forEach((sample, index) => {
          const blob = new Blob([sample.content], { type: 'text/markdown' })
          files.put({
            id: sample.id,
            name: sample.name,
            collection: 'files',
            mediaType: blob.type,
            previewKind: 'markdown',
            size: blob.size,
            lastModified: 0,
            createdAt: index,
            revision: 1,
          })
          contents.put({ id: sample.id, blob })
        })
      }
      if (oldVersion === 1) {
        const files = transaction.objectStore('files')
        void (async () => {
          let cursor = await files.openCursor()
          while (cursor) {
            await cursor.update({ ...cursor.value, collection: 'files' })
            cursor = await cursor.continue()
          }
        })().catch(error => {
          console.error('Unable to migrate the local file library', error)
          transaction.abort()
        })
      }
    },
  }).catch(error => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export const closeFileStore = async () => {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
}

export const deleteFileStore = async () => {
  await closeFileStore()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Unable to delete file database'))
    request.onblocked = () => reject(new Error('Unable to delete an open file database'))
  })
}

export const listStoredFiles = async () => {
  const database = await openFileDatabase()
  return database.getAllFromIndex('files', 'by-created-at')
}

export const getStoredFileContent = async (id: string) => {
  const database = await openFileDatabase()
  return (await database.get('contents', id))?.blob ?? null
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
  return { metadata, blob: content.blob }
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
): Promise<ImportResult> => {
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

  try {
    const transaction = database.transaction(['files', 'contents'], 'readwrite')
    await Promise.all([
      ...plannedWrites.flatMap(write => [
        transaction.objectStore('files').put(write.metadata),
        transaction.objectStore('contents').put(write.content),
      ]),
      transaction.done,
    ])
  } catch (error) {
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

export const removeStoredFile = async (id: string) => {
  const database = await openFileDatabase()
  const transaction = database.transaction(['files', 'contents'], 'readwrite')
  await Promise.all([
    transaction.objectStore('files').delete(id),
    transaction.objectStore('contents').delete(id),
    transaction.done,
  ])
}

export const requestPersistentStorage = async () => {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch (error) {
    console.error('Unable to request persistent browser storage', error)
    return false
  }
}
