import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { deleteIndexedDatabase } from '../../data/workspace-database'
import type { MemoryEntry } from './entry'

type MemoryDatabase = DBSchema & {
  entries: { key: string; value: MemoryEntry }
}

// One database for every project, beside the project registry: memory follows the reader.
const databaseName = 'gamma-reader-memory'
let databasePromise: Promise<IDBPDatabase<MemoryDatabase>> | undefined

const openMemoryDatabase = () => {
  databasePromise ??= openDB<MemoryDatabase>(databaseName, 1, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore('entries', { keyPath: 'id' })
    },
  }).catch(error => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export const listMemories = async () => (await openMemoryDatabase()).getAll('entries')

export const saveMemory = async (entry: MemoryEntry) => {
  await (await openMemoryDatabase()).put('entries', entry)
}

export const removeMemory = async (id: string) => {
  await (await openMemoryDatabase()).delete('entries', id)
}

export const touchMemories = async (ids: readonly string[], at: number) => {
  const transaction = (await openMemoryDatabase()).transaction('entries', 'readwrite')
  await Promise.all(
    ids.map(async id => {
      const entry = await transaction.store.get(id)
      if (entry) await transaction.store.put({ ...entry, confirmedAt: at })
    }),
  )
  await transaction.done
}

// What was saved about the reader stays when a project goes; what was about the project goes too.
export const removeProjectMemories = async (projectKey: string) => {
  const transaction = (await openMemoryDatabase()).transaction('entries', 'readwrite')
  const entries = await transaction.store.getAll()
  await Promise.all(
    entries
      .filter(entry => entry.scope === 'project' && entry.projectKey === projectKey)
      .map(entry => transaction.store.delete(entry.id)),
  )
  await transaction.done
}

export const deleteMemoryStore = async () => {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
  await deleteIndexedDatabase(databaseName)
}
