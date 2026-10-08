import { Type } from '@earendil-works/pi-ai'
import { bind } from '../../agent/tool'
import { LocalToolError } from '../../agent/tool-types'
import type { MemoryEntry } from '../entry'
import { createMemoTools, filedUnder, visibleNote, visibleNotes } from '../memo-tools'
import { reviseMemory, saveMemory } from '../store'
import { liveNotes, newNote, noteIds, noteText, tagNames } from './notes'

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
