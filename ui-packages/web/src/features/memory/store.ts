import { type DBSchema, type IDBPDatabase, type IDBPObjectStore, openDB } from 'idb'
import { deleteIndexedDatabase } from '../../data/workspace-database'
import { type MemoryEntry, type MemoryTag, normalizeEntry } from './entry'

type MemoryDatabase = DBSchema & {
  entries: { key: string; value: MemoryEntry }
  tags: { key: string; value: MemoryTag }
  // How far each conversation has been organized: `${projectKey}/${conversationId}` → position.
  progress: { key: string; value: number }
}

// One database for every project, beside the project registry: memory follows the reader.
const databaseName = 'gamma-reader-memory'
let databasePromise: Promise<IDBPDatabase<MemoryDatabase>> | undefined

const openMemoryDatabase = () => {
  databasePromise ??= openDB<MemoryDatabase>(databaseName, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) database.createObjectStore('entries', { keyPath: 'id' })
      if (oldVersion < 2) {
        database.createObjectStore('tags', { keyPath: 'name' })
        database.createObjectStore('progress')
      }
    },
  }).catch(error => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

type EntryStore = IDBPObjectStore<MemoryDatabase, ['entries'], 'entries', 'readwrite'>

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

const write = async <T>(change: (store: EntryStore) => Promise<T>): Promise<T> => {
  const transaction = (await openMemoryDatabase()).transaction('entries', 'readwrite')
  const result = await change(transaction.store)
  await transaction.done
  changed()
  return result
}

export const listMemories = async () =>
  (await (await openMemoryDatabase()).getAll('entries')).map(normalizeEntry)

export const saveMemory = (entry: MemoryEntry) => write(store => store.put(entry))

// The note as revised, or undefined when it is gone. A revision makes the note current again.
export const reviseMemory = (id: string, revise: (entry: MemoryEntry) => MemoryEntry) =>
  write(async store => {
    const entry = await store.get(id)
    if (!entry) return undefined
    const now = Date.now()
    const revised = { ...revise(normalizeEntry(entry)), updatedAt: now, confirmedAt: now }
    await store.put(revised)
    return revised
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

// Files a merged note and puts the notes it replaces out of sight, in one step, so a merge is
// never half done.
export const mergeMemories = (ids: readonly string[], merged: MemoryEntry) =>
  write(async store => {
    await store.put(merged)
    await Promise.all(
      ids.map(async id => {
        const entry = await store.get(id)
        if (entry) await store.put({ ...entry, mergedInto: merged.id })
      }),
    )
  })

// Brings a merged note back; the note it was merged into stays for the reader to keep or delete.
export const restoreMerged = (id: string) =>
  write(async store => {
    const entry = await store.get(id)
    if (!entry) return
    const { mergedInto: _merged, ...restored } = entry
    await store.put(restored)
  })

export const listTags = async () => (await openMemoryDatabase()).getAll('tags')

export const saveTag = async (tag: MemoryTag) => {
  await (await openMemoryDatabase()).put('tags', tag)
  changed()
}

// Folds one tag into another: its name and aliases become aliases, and its notes move over.
export const mergeTags = async (from: string, into: string) => {
  const database = await openMemoryDatabase()
  const transaction = database.transaction(['tags', 'entries'], 'readwrite')
  const [source, target] = await Promise.all([
    transaction.objectStore('tags').get(from),
    transaction.objectStore('tags').get(into),
  ])
  if (!source || !target) {
    transaction.abort()
    return null
  }
  const merged = {
    ...target,
    aliases: [...new Set([...target.aliases, source.name, ...source.aliases])].filter(
      alias => alias !== target.name,
    ),
    description: target.description || source.description,
  }
  const entries = await transaction.objectStore('entries').getAll()
  await Promise.all([
    transaction.objectStore('tags').put(merged),
    transaction.objectStore('tags').delete(from),
    ...entries
      .filter(entry => (entry.tags ?? []).includes(from))
      .map(entry =>
        transaction.objectStore('entries').put({
          ...entry,
          tags: [...new Set((entry.tags ?? []).map(tag => (tag === from ? into : tag)))],
        }),
      ),
  ])
  await transaction.done
  changed()
  return merged
}

const progressKey = (projectKey: string, conversationId: string) =>
  `${projectKey}/${conversationId}`
const projectRange = (projectKey: string) => IDBKeyRange.bound(`${projectKey}/`, `${projectKey}/￿`)

// How far each of the project's conversations has been organized, by conversation id.
export const readProgress = async (projectKey: string) => {
  const database = await openMemoryDatabase()
  const [keys, values] = await Promise.all([
    database.getAllKeys('progress', projectRange(projectKey)),
    database.getAll('progress', projectRange(projectKey)),
  ])
  return new Map(keys.map((key, index) => [key.slice(projectKey.length + 1), values[index] ?? 0]))
}

// Progress only moves forward, so a late or repeated mark cannot undo later work.
export const markProgress = async (projectKey: string, conversationId: string, through: number) => {
  const transaction = (await openMemoryDatabase()).transaction('progress', 'readwrite')
  const key = progressKey(projectKey, conversationId)
  const current = (await transaction.store.get(key)) ?? 0
  if (through > current) await transaction.store.put(through, key)
  await transaction.done
  changed()
  return Math.max(current, through)
}

// What was saved about the reader stays when a project goes; what was about the project goes too.
export const removeProjectMemories = async (projectKey: string) => {
  await write(async store => {
    const entries = await store.getAll()
    await Promise.all(
      entries
        .filter(entry => entry.scope === 'project' && entry.projectKey === projectKey)
        .map(entry => store.delete(entry.id)),
    )
  })
  await (await openMemoryDatabase()).delete('progress', projectRange(projectKey))
}

export const deleteMemoryStore = async () => {
  const database = await databasePromise
  database?.close()
  databasePromise = undefined
  await deleteIndexedDatabase(databaseName)
}
