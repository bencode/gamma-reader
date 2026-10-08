import { Type } from '@earendil-works/pi-ai'
import { bind, LocalToolError } from '../../../core/agent/tool'
import { findTag, type MemoryEntry, type MemoSource } from '../entry'
import { createMemoTools, filedUnder, visibleNote } from '../memo-tools'
import { listTags, mergeMemories, mergeTags, reviseMemory } from '../store'
import { liveNotes, newNote, noteIds, noteText, tagNames, unique } from './notes'

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
