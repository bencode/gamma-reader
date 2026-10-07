import { Type } from '@earendil-works/pi-ai'
import { bind } from '../agent/tool'
import { LocalToolError } from '../agent/tool-types'
import {
  findTag,
  type MemoryEntry,
  type MemoryTag,
  sourceConversations,
  visibleMemories,
} from './entry'
import { searchMemories } from './search'
import { listMemories, listTags, saveTag } from './store'

const listPage = 40

// A note as an agent browsing many of them sees it.
const summary = (entry: MemoryEntry) => ({
  id: entry.id,
  text: entry.text,
  scope: entry.scope,
  tags: entry.tags,
  conversations: sourceConversations(entry),
  ...(entry.derivedFrom && { derivedFrom: entry.derivedFrom }),
})

// The notes of a project, for any agent that reads or reorganizes them.
export const visibleNotes = async (projectKey: string) =>
  visibleMemories(await listMemories(), projectKey)

export const visibleNote = async (projectKey: string, id: string) => {
  const note = (await visibleNotes(projectKey)).find(entry => entry.id === id)
  if (!note)
    throw new LocalToolError(`No note ${id} here. Use an id from list_memos or search_memos.`)
  return note
}

// A tag a note is filed under, as the list spells it; a name the list lacks is refused, so every
// tag an agent files under carries its aliases and what it stands for.
export const filedUnder = async (names: readonly string[]) => {
  const tags = await listTags()
  const unknown = names.filter(name => !findTag(tags, name))
  if (unknown.length)
    throw new LocalToolError(
      `No tag ${unknown.join(', ')}. Use a tag from list_tags, or add it first with define_tag.`,
    )
  return [...new Set(names.map(name => findTag(tags, name)?.name ?? name))]
}

const counted = (tags: readonly MemoryTag[], notes: readonly MemoryEntry[]) =>
  tags.map(tag => ({ ...tag, notes: notes.filter(note => note.tags.includes(tag.name)).length }))

export const createMemoTools = (projectKey: string) => ({
  listTags: bind(
    'list_tags',
    'List the tags notes are filed under, with their aliases, what each stands for and how many notes here use it.',
    Type.Object({}),
    async () => ({ tags: counted(await listTags(), await visibleNotes(projectKey)) }),
  ),
  listMemos: bind(
    'list_memos',
    `List the notes about the reader and this project, ${listPage} at a time, optionally those under one tag. A note with derivedFrom is an abstraction drawn from other notes. Follow next as cursor.`,
    Type.Object({
      tag: Type.Optional(Type.String({ minLength: 1 })),
      cursor: Type.Optional(Type.Integer({ minimum: 0 })),
    }),
    async ({ tag, cursor = 0 }) => {
      const tags = await listTags()
      const name = tag && (findTag(tags, tag)?.name ?? tag)
      const notes = (await visibleNotes(projectKey)).filter(
        note => !name || note.tags.includes(name),
      )
      const page = notes.slice(cursor, cursor + listPage)
      return {
        notes: page.map(summary),
        total: notes.length,
        next: cursor + listPage < notes.length ? cursor + listPage : null,
      }
    },
  ),
  searchMemos: bind(
    'search_memos',
    'Search existing notes about the reader and this project by several short queries, in Chinese and English.',
    Type.Object({
      queries: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
        minItems: 1,
        maxItems: 8,
      }),
    }),
    async ({ queries }) => {
      const hits = await searchMemories(
        await visibleNotes(projectKey),
        queries,
        10,
        await listTags(),
      )
      return { notes: hits.map(({ entry }) => summary(entry)) }
    },
  ),
  readMemo: bind(
    'read_memo',
    'Read one note in full, with its tags, the conversations it was drawn from and, for an abstraction, the notes it rests on.',
    Type.Object({ id: Type.String({ minLength: 1 }) }),
    async ({ id }) => visibleNote(projectKey, id),
  ),
  defineTag: bind(
    'define_tag',
    'Add a tag for a concept no tag covers yet, with aliases in Chinese and English and one line on what it stands for. A name that is already a tag or alias adds the aliases to that tag.',
    Type.Object({
      name: Type.String({ minLength: 1, maxLength: 60 }),
      aliases: Type.Optional(
        Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 8 }),
      ),
      description: Type.Optional(Type.String({ maxLength: 200 })),
    }),
    async ({ name, aliases = [], description = '' }) => {
      const tags = await listTags()
      const known = findTag(tags, name) ?? aliases.map(alias => findTag(tags, alias)).find(Boolean)
      const tag = known
        ? {
            ...known,
            aliases: [
              ...new Set([
                ...known.aliases,
                ...[name, ...aliases].filter(word => word !== known.name),
              ]),
            ],
            description: known.description || description,
          }
        : { name: name.trim(), aliases: [...new Set(aliases)], description }
      await saveTag(tag)
      return { tag }
    },
  ),
})
