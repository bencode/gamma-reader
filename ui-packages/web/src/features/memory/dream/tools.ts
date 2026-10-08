import { Type } from '@earendil-works/pi-ai'
import { nanoid } from 'nanoid'
import { bind } from '../../agent/tool'
import { LocalToolError } from '../../agent/tool-types'
import { findTag, type MemoryEntry, type MemoSource } from '../entry'
import { createMemoTools, filedUnder, visibleNote, visibleNotes } from '../memo-tools'
import { listTags, mergeMemories, mergeTags, reviseMemory, saveMemory } from '../store'

const noteText = Type.String({ minLength: 1, maxLength: 800 })
const tagNames = Type.Array(Type.String({ minLength: 1, maxLength: 60 }), {
  minItems: 1,
  maxItems: 3,
})
const noteIds = Type.Array(Type.String({ minLength: 1 }), { minItems: 2, maxItems: 20 })

const unique = <T>(items: readonly T[], key: (item: T) => string) => [
  ...new Map(items.map(item => [key(item), item])).values(),
]

// Several notes of this project, all in use; one that is gone or merged stops the change.
const liveNotes = async (projectKey: string, ids: readonly string[]) => {
  const notes = await visibleNotes(projectKey)
  const missing = ids.filter(id => !notes.some(note => note.id === id))
  if (missing.length) throw new LocalToolError(`No note ${missing.join(', ')} here.`)
  return ids.flatMap(id => notes.filter(note => note.id === id))
}

const newNote = (
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

// Tidying: one note per topic, how things stand now, and one tag per concept.
export const createTidyTools = (projectKey: string, lastRunAt: number | null) => {
  const memos = createMemoTools(projectKey, lastRunAt)
  return [
    memos.listTags,
    memos.listMemos,
    memos.searchMemos,
    memos.defineTag,
    bind(
      'merge_memos',
      'Merge notes that say the same thing into one, written as how things stand now. They must share a scope. The new note keeps all their sources; the old ones are kept out of sight and can be restored by the reader.',
      Type.Object({ ids: noteIds, text: noteText, tags: tagNames }),
      async ({ ids, text, tags }) => {
        const notes = await liveNotes(projectKey, [...new Set(ids)])
        const [first] = notes
        if (!first || notes.length < 2) throw new LocalToolError('Name at least two notes.')
        const sameHome = (note: MemoryEntry) =>
          note.scope === first.scope &&
          (note.scope === 'reader' || note.projectKey === first.projectKey)
        if (!notes.every(sameHome))
          throw new LocalToolError('Only notes of the same scope and project can be merged.')
        const derivedFrom = notes.flatMap(note => note.derivedFrom ?? [])
        const merged = newNote(first.projectKey, {
          text: text.trim(),
          scope: first.scope,
          core: notes.some(note => note.core),
          tags: await filedUnder(tags),
          sources: unique(
            notes.flatMap(note => note.sources),
            (item: MemoSource) =>
              `${item.projectKey}/${item.conversationId}/${item.from}/${item.to}`,
          ),
          ...(derivedFrom.length && { derivedFrom: [...new Set(derivedFrom)] }),
        })
        await mergeMemories(
          notes.map(note => note.id),
          merged,
        )
        return { id: merged.id, merged: notes.map(note => note.id) }
      },
    ),
    bind(
      'update_memo',
      'Rewrite a note to say how things stand now, or refile it under other tags. Its sources stay as they are.',
      Type.Object({
        id: Type.String({ minLength: 1 }),
        text: Type.Optional(noteText),
        tags: Type.Optional(tagNames),
      }),
      async ({ id, text, tags }) => {
        await visibleNote(projectKey, id)
        const filed = tags ? await filedUnder(tags) : undefined
        await reviseMemory(id, note => ({
          ...note,
          text: text?.trim() ?? note.text,
          tags: filed ?? note.tags,
        }))
        return { id }
      },
    ),
    bind(
      'merge_tags',
      'Fold a tag into another that stands for the same concept: its name and aliases become aliases of the other, and its notes move over.',
      Type.Object({ from: Type.String({ minLength: 1 }), into: Type.String({ minLength: 1 }) }),
      async ({ from, into }) => {
        const tags = await listTags()
        const source = findTag(tags, from)
        const target = findTag(tags, into)
        if (!source || !target) throw new LocalToolError('Both tags must be on list_tags.')
        if (source.name === target.name) throw new LocalToolError('Those are the same tag.')
        return { tag: await mergeTags(source.name, target.name) }
      },
    ),
  ]
}

// What an abstraction may rest on: notes, not other abstractions, so memory stays two layers; at
// least two about this project, so a pair of stated preferences is not passed off as a pattern; and
// no tag shared by all of them, since notes all under one subject make a summary, not a pattern.
const checkGrounds = (notes: readonly MemoryEntry[]) => {
  if (notes.some(note => note.derivedFrom))
    throw new LocalToolError(
      'An abstraction rests on notes, not on other abstractions. Point to the notes those draw on.',
    )
  if (notes.filter(note => note.scope === 'project').length < 2)
    throw new LocalToolError(
      'An abstraction rests on at least two notes about this project, not only on what the reader said about themselves.',
    )
  const [first, ...rest] = notes
  const shared = (first?.tags ?? []).filter(name => rest.every(note => note.tags.includes(name)))
  if (shared.length)
    throw new LocalToolError(
      `These notes all sit under ${shared.join(', ')}: together they summarize one subject. An abstraction is a pattern across subjects; add notes from elsewhere that show it, or file nothing.`,
    )
}

// Abstracting: what holds across several notes, filed as a note of its own that points to them.
export const createAbstractTools = (projectKey: string, lastRunAt: number | null) => {
  const memos = createMemoTools(projectKey, lastRunAt)
  const abstraction = async (id: string) => {
    const note = await visibleNote(projectKey, id)
    if (!note.derivedFrom)
      throw new LocalToolError('Only an abstraction, a note with derivedFrom, can be revised here.')
    return note
  }
  return [
    memos.listTags,
    memos.listMemos,
    memos.searchMemos,
    memos.defineTag,
    bind(
      'derive_memo',
      'File an abstraction: what holds across two or more notes, such as how the reader learns, what keeps getting in their way or where they stand overall, pointing to the notes it rests on. Scope reader only for what holds beyond this project.',
      Type.Object({
        fromIds: noteIds,
        text: noteText,
        tags: tagNames,
        scope: Type.Union([Type.Literal('reader'), Type.Literal('project')]),
      }),
      async ({ fromIds, text, tags, scope }) => {
        const notes = await liveNotes(projectKey, [...new Set(fromIds)])
        checkGrounds(notes)
        const note = newNote(projectKey, {
          text: text.trim(),
          scope,
          tags: await filedUnder(tags),
          sources: [],
          derivedFrom: notes.map(item => item.id),
        })
        await saveMemory(note)
        return { id: note.id }
      },
    ),
    bind(
      'update_derived',
      'Revise an abstraction to say how things stand now, and add notes it now also rests on.',
      Type.Object({
        id: Type.String({ minLength: 1 }),
        text: Type.Optional(noteText),
        addFromIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 })),
      }),
      async ({ id, text, addFromIds = [] }) => {
        const current = await abstraction(id)
        const added = await liveNotes(projectKey, [...new Set(addFromIds)])
        // Notes it rested on that have since been merged away no longer count.
        const kept = (await visibleNotes(projectKey)).filter(note =>
          current.derivedFrom?.includes(note.id),
        )
        checkGrounds([...kept, ...added.filter(note => !kept.includes(note))])
        await reviseMemory(id, note => ({
          ...note,
          text: text?.trim() ?? note.text,
          derivedFrom: [...new Set([...(note.derivedFrom ?? []), ...added.map(item => item.id)])],
        }))
        return { id }
      },
    ),
  ]
}
