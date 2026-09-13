import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { StoredConversation, StoredConversationMessage } from '../core/conversations'
import type { StoredFileContent, StoredFileMetadata } from '../core/files'
import { samples } from '../core/samples'

export type WorkspaceDatabase = DBSchema & {
  files: {
    key: string
    value: StoredFileMetadata
    indexes: { 'by-created-at': number }
  }
  contents: { key: string; value: StoredFileContent }
  conversations: {
    key: string
    value: StoredConversation
    indexes: { 'by-last-active': [number, string] }
  }
  messages: {
    key: [string, number]
    value: StoredConversationMessage
    indexes: { 'by-conversation': string }
  }
}

const databaseName = 'gamma-reader-files'
let databasePromise: Promise<IDBPDatabase<WorkspaceDatabase>> | undefined

export const openWorkspaceDatabase = () => {
  databasePromise ??= openDB<WorkspaceDatabase>(databaseName, 3, {
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
      if (oldVersion < 3) {
        const conversations = database.createObjectStore('conversations', { keyPath: 'id' })
        conversations.createIndex('by-last-active', ['lastActiveAt', 'id'])
        const messages = database.createObjectStore('messages', {
          keyPath: ['conversationId', 'position'],
        })
        messages.createIndex('by-conversation', 'conversationId')
      }
    },
  }).catch(error => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export const closeWorkspaceDatabase = async () => {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
}

export const deleteWorkspaceDatabase = async () => {
  await closeWorkspaceDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to delete workspace database'))
    request.onblocked = () => reject(new Error('Unable to delete an open workspace database'))
  })
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
