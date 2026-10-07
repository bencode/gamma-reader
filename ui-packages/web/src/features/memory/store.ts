import { type DBSchema, type IDBPDatabase, type IDBPObjectStore, openDB } from 'idb'
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

type MemoryStore = IDBPObjectStore<MemoryDatabase, ['entries'], 'entries', 'readwrite'>

// Heard in this tab after every write, so an open Memory page follows what the assistant saves.
const listeners = new Set<() => void>()

export const subscribeMemories = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const changed = () => {
  listeners.forEach(listener => {
    listener()
  })
}

const write = async <T>(change: (store: MemoryStore) => Promise<T>): Promise<T> => {
  const transaction = (await openMemoryDatabase()).transaction('entries', 'readwrite')
  const result = await change(transaction.store)
  await transaction.done
  changed()
  return result
}

export const listMemories = async () => (await openMemoryDatabase()).getAll('entries')

export const saveMemory = (entry: MemoryEntry) => write(store => store.put(entry))

// A correction is as good as a recall: the note is current again.
export const updateMemory = (id: string, patch: Pick<MemoryEntry, 'text' | 'core'>) =>
  write(async store => {
    const entry = await store.get(id)
    if (entry) await store.put({ ...entry, ...patch, confirmedAt: Date.now() })
  })

// The entries that were there to remove.
export const removeMemories = (ids: readonly string[]) =>
  write(async store => {
    const found = await Promise.all(ids.map(id => store.get(id)))
    const existing = found.filter(entry => entry !== undefined)
    await Promise.all(existing.map(entry => store.delete(entry.id)))
    return existing
  })

export const touchMemories = async (ids: readonly string[], at: number) => {
  if (!ids.length) return
  await write(store =>
    Promise.all(
      ids.map(async id => {
        const entry = await store.get(id)
        if (entry) await store.put({ ...entry, confirmedAt: at })
      }),
    ),
  )
}

// What was saved about the reader stays when a project goes; what was about the project goes too.
export const removeProjectMemories = (projectKey: string) =>
  write(async store => {
    const entries = await store.getAll()
    await Promise.all(
      entries
        .filter(entry => entry.scope === 'project' && entry.projectKey === projectKey)
        .map(entry => store.delete(entry.id)),
    )
  })

export const deleteMemoryStore = async () => {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
  await deleteIndexedDatabase(databaseName)
}
