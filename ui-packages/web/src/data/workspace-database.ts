import type { ParsedNote } from '@gamma-reader/links'
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { StoredConversation, StoredConversationMessage } from '../core/conversations'
import { previewKindFor, type StoredFileContent, type StoredFileMetadata } from '../core/files'
import { legacyDatabaseName } from '../core/projects'
import type { WritableDirectoryHandle } from '../utils/file-system-access'

// The folder files were last saved to, and the version of each file saved there, so a later save
// can tell its own files from someone else's.
export type ExportedFileVersion = Pick<StoredFileMetadata, 'id' | 'path' | 'revision'>

export type FolderExportRecord = {
  id: 'files'
  directory: WritableDirectoryHandle
  savedFiles: ExportedFileVersion[]
  savedAt: number
}

// A Markdown file's links as parsed at one revision. A note that could not be read — too large to
// read as text, or not UTF-8 — is kept as null, so it is not tried again until it changes.
export type NoteRecord = { fileId: string; revision: number; note: ParsedNote | null }

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
  folderExports: { key: string; value: FolderExportRecord }
  // What each Markdown file links to, parsed at a revision. A cache: dropping it only costs a
  // fresh parse.
  notes: { key: string; value: NoteRecord }
}

// Records written before version 7 named a file instead of placing it on a path.
type LegacyFileRecord = Omit<StoredFileMetadata, 'path'> & { path?: string; name?: string }
type LegacyExportedFile = { id: string; revision: number; path?: string; name?: string }

// A page opens one project for its whole life, chosen from the address before anything is read.
let databaseName = legacyDatabaseName
let databasePromise: Promise<IDBPDatabase<WorkspaceDatabase>> | undefined

export const setWorkspaceDatabaseName = (name: string) => {
  if (name === databaseName) return
  closeWorkspaceDatabase().catch(error => {
    console.error('Unable to close the previous workspace database', error)
  })
  databaseName = name
}

export const workspaceDatabaseName = () => databaseName

export const workspaceStorageBases = {
  workspace: 'gamma-reader.workspace',
  activeConversation: 'gamma-reader.active-conversation',
  sourceSync: 'gamma-reader.source-sync',
} as const

// Settings saved before projects existed belong to the legacy library and keep their keys.
export const workspaceStorageKey = (base: string, name = databaseName) =>
  name === legacyDatabaseName ? base : `${base}:${name}`

// Only the first caller hears that the open is blocked; later callers share the same open.
export const openWorkspaceDatabase = (onBlocked?: () => void) => {
  if (databasePromise) return databasePromise
  databasePromise = openDB<WorkspaceDatabase>(databaseName, 9, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const files = database.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        database.createObjectStore('contents', { keyPath: 'id' })
      }
      if (oldVersion < 3) {
        const conversations = database.createObjectStore('conversations', { keyPath: 'id' })
        conversations.createIndex('by-last-active', ['lastActiveAt', 'id'])
        const messages = database.createObjectStore('messages', {
          keyPath: ['conversationId', 'position'],
        })
        messages.createIndex('by-conversation', 'conversationId')
      }
      if (oldVersion < 4) database.createObjectStore('folderExports', { keyPath: 'id' })
      if (oldVersion < 9) database.createObjectStore('notes', { keyPath: 'fileId' })
      // One pass rewrites every older record, so no two cursors write back stale copies of it:
      // version 1 lacked a collection, files from before version 8 may carry an outdated preview
      // kind (source code was not read as text before then), and files from before version 7
      // were named rather than placed on a path.
      if (oldVersion > 0 && oldVersion < 8) {
        const files = transaction.objectStore('files')
        void (async () => {
          let cursor = await files.openCursor()
          while (cursor) {
            const { name, ...value }: LegacyFileRecord = cursor.value
            const path = value.path ?? name
            if (path === undefined) throw new Error(`Stored file has no path: ${value.id}`)
            await cursor.update({
              ...value,
              path,
              collection: oldVersion === 1 ? 'files' : value.collection,
              previewKind: previewKindFor(path, value.mediaType),
            })
            cursor = await cursor.continue()
          }
        })().catch(error => {
          console.error('Unable to migrate the local file library', error)
          transaction.abort()
        })
      }
      if (oldVersion >= 4 && oldVersion < 7) {
        const exports = transaction.objectStore('folderExports')
        void (async () => {
          let cursor = await exports.openCursor()
          while (cursor) {
            const savedFiles: readonly LegacyExportedFile[] = cursor.value.savedFiles
            await cursor.update({
              ...cursor.value,
              savedFiles: savedFiles.map(({ id, revision, name, path = name }) => {
                if (path === undefined) throw new Error(`Saved export has no path: ${id}`)
                return { id, revision, path }
              }),
            })
            cursor = await cursor.continue()
          }
        })().catch(error => {
          console.error('Unable to migrate the saved export folder', error)
          transaction.abort()
        })
      }
    },
    // A newer page is upgrading the library, so this page's code is out of date: let go so the
    // upgrade can finish. A deletion is not given way to — deleting a project waits for other
    // tabs to close, and this page reading again would recreate the deleted library empty.
    blocking(_currentVersion, blockedVersion) {
      if (blockedVersion !== null)
        closeWorkspaceDatabase().catch(error => {
          console.error('Unable to close the library for an upgrade', error)
        })
    },
    blocked() {
      onBlocked?.()
    },
  }).catch(error => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export const closeWorkspaceDatabase = async () => {
  const pending = databasePromise
  databasePromise = undefined
  const database = await pending
  database?.close()
}

// A blocked deletion stays queued until the connections holding it close. Without onBlocked the
// caller is told at once; with it the caller may wait for the deletion to finish.
export const deleteIndexedDatabase = (name: string, onBlocked?: () => void) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`))
    request.onblocked = () =>
      onBlocked ? onBlocked() : reject(new Error(`Unable to delete an open database: ${name}`))
  })

export const deleteWorkspaceDatabase = async () => {
  await closeWorkspaceDatabase()
  await deleteIndexedDatabase(databaseName)
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
