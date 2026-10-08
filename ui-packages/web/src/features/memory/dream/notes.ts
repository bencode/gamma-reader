import { Type } from '@earendil-works/pi-ai'
import { nanoid } from 'nanoid'
import { LocalToolError } from '../../agent/tool-types'
import type { MemoryEntry } from '../entry'
import { visibleNotes } from '../memo-tools'

// What tidying and abstracting share: the shapes of their inputs, and the notes they work on.
export const noteText = Type.String({ minLength: 1, maxLength: 800 })
export const tagNames = Type.Array(Type.String({ minLength: 1, maxLength: 60 }), {
  minItems: 1,
  maxItems: 3,
})
export const noteIds = Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 20 })

export const unique = <T>(items: readonly T[], key: (item: T) => string) => [
  ...new Map(items.map(item => [key(item), item])).values(),
]

// Several notes of this project, all in use; one that is gone or merged stops the change.
export const liveNotes = async (projectKey: string, ids: readonly string[]) => {
  const notes = await visibleNotes(projectKey)
  const missing = ids.filter(id => !notes.some(note => note.id === id))
  if (missing.length) throw new LocalToolError(`No note ${missing.join(', ')} here.`)
  return ids.flatMap(id => notes.filter(note => note.id === id))
}

export const newNote = (
  projectKey: string,
  fields: Pick<MemoryEntry, 'text' | 'scope' | 'tags' | 'sources'> & Partial<MemoryEntry>,
): MemoryEntry => {
  const now = Date.now()
  return {
    id: nanoid(),
    core: false,
    projectKey,
    conversationId: fields.sources[0]?.conversationId ?? '',
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    ...fields,
  }
}
