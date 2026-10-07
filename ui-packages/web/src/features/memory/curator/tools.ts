import { Type } from '@earendil-works/pi-ai'
import { nanoid } from 'nanoid'
import { bind } from '../../agent/tool'
import { LocalToolError } from '../../agent/tool-types'
import { findTag, type MemoryEntry, type MemoSource, visibleMemories } from '../entry'
import { searchMemories } from '../search'
import { listMemories, listTags, markProgress, reviseMemory, saveMemory, saveTag } from '../store'
import { readTranscript } from '../transcript'
import { pendingConversations } from './pending'

const listedConversations = 10

const source = Type.Object({
  conversationId: Type.String({ minLength: 1 }),
  from: Type.Integer({ minimum: 0 }),
  to: Type.Integer({ minimum: 0 }),
})

const tagNames = Type.Array(Type.String({ minLength: 1, maxLength: 60 }), {
  minItems: 1,
  maxItems: 3,
})

const sameSource = (a: MemoSource, b: MemoSource) =>
  a.conversationId === b.conversationId && a.from === b.from && a.to === b.to

// The curator files notes only under tags it has defined, so every tag carries its aliases and
// what it stands for; a name the list lacks is refused with what to do instead.
const filedUnder = async (names: readonly string[]) => {
  const tags = await listTags()
  const unknown = names.filter(name => !findTag(tags, name))
  if (unknown.length)
    throw new LocalToolError(
      `No tag ${unknown.join(', ')}. Use a tag from list_tags, or add it first with define_tag.`,
    )
  return [...new Set(names.map(name => findTag(tags, name)?.name ?? name))]
}

export const createCuratorTools = (projectKey: string) => {
  // A source must name a stretch of one of this project's conversations.
  const checkSources = async (sources: readonly MemoSource[]) => {
    const checked = await Promise.all(
      sources.map(async item => {
        const page = await readTranscript(item.conversationId, {})
        if (!page)
          throw new LocalToolError(`No conversation ${item.conversationId} in this project.`)
        if (item.from > item.to || item.to >= page.messageCount)
          throw new LocalToolError(
            `Positions in ${item.conversationId} run from 0 to ${page.messageCount - 1}.`,
          )
        return item
      }),
    )
    return checked
  }

  const visibleNote = async (id: string) => {
    const note = visibleMemories(await listMemories(), projectKey).find(entry => entry.id === id)
    if (!note) throw new LocalToolError('No such note. Use an id from search_memos.')
    return note
  }

  return [
    bind(
      'list_pending_conversations',
      `List conversations in this project with something new to organize, newest first, at most ${listedConversations}. from is the first message position not yet organized.`,
      Type.Object({}),
      async () => {
        const pending = await pendingConversations(projectKey)
        return { conversations: pending.slice(0, listedConversations), total: pending.length }
      },
    ),
    bind(
      'read_conversation',
      "Read a conversation from a message position: the reader's words and the assistant's answers, without tool results. Follow next as from to read on; next is null at the end.",
      Type.Object({
        id: Type.String({ minLength: 1 }),
        from: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
      async ({ id, from = 0 }) => {
        const page = await readTranscript(id, { from })
        if (!page) throw new LocalToolError('No such conversation in this project.')
        return page
      },
    ),
    bind(
      'mark_organized',
      'Record that a conversation has been organized up to and including a message position. Mark a conversation even when nothing in it was worth a note.',
      Type.Object({ id: Type.String({ minLength: 1 }), through: Type.Integer({ minimum: 0 }) }),
      async ({ id, through }) => {
        const page = await readTranscript(id, {})
        if (!page) throw new LocalToolError('No such conversation in this project.')
        if (through >= page.messageCount)
          throw new LocalToolError(`The last message position is ${page.messageCount - 1}.`)
        // Progress counts messages, so it stands one past the last position organized.
        return { organizedThrough: (await markProgress(projectKey, id, through + 1)) - 1 }
      },
    ),
    bind(
      'list_tags',
      'List the tags notes are filed under, with their aliases and what each stands for.',
      Type.Object({}),
      async () => ({ tags: await listTags() }),
    ),
    bind(
      'search_memos',
      'Search existing notes about the reader and this project by several short queries, in Chinese and English.',
      Type.Object({
        queries: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
          minItems: 1,
          maxItems: 5,
        }),
      }),
      async ({ queries }) => {
        const visible = visibleMemories(await listMemories(), projectKey)
        const hits = await searchMemories(visible, queries, 10, await listTags())
        return {
          notes: hits.map(({ entry }) => ({
            id: entry.id,
            text: entry.text,
            scope: entry.scope,
            tags: entry.tags,
          })),
        }
      },
    ),
    bind(
      'read_memo',
      'Read one note in full, with its tags and the conversations it was drawn from.',
      Type.Object({ id: Type.String({ minLength: 1 }) }),
      async ({ id }) => visibleNote(id),
    ),
    bind(
      'write_memo',
      'File a new note: an abstract summary that says what the reader is doing, cares about, understands or prefers, with the stretches of conversation it rests on.',
      Type.Object({
        text: Type.String({ minLength: 1, maxLength: 800 }),
        scope: Type.Union([Type.Literal('reader'), Type.Literal('project')]),
        tags: tagNames,
        sources: Type.Array(source, { minItems: 1, maxItems: 10 }),
      }),
      async ({ text, scope, tags, sources }) => {
        const checked = await checkSources(sources)
        const now = Date.now()
        const note: MemoryEntry = {
          id: nanoid(),
          text: text.trim(),
          scope,
          core: false,
          projectKey,
          conversationId: checked[0]?.conversationId ?? '',
          createdAt: now,
          confirmedAt: now,
          tags: await filedUnder(tags),
          sources: checked,
        }
        await saveMemory(note)
        return { id: note.id }
      },
    ),
    bind(
      'update_memo',
      'Revise a note to say how things stand now, and add the conversations the revision rests on. Leave out what does not change.',
      Type.Object({
        id: Type.String({ minLength: 1 }),
        text: Type.Optional(Type.String({ minLength: 1, maxLength: 800 })),
        tags: Type.Optional(tagNames),
        addSources: Type.Optional(Type.Array(source, { maxItems: 10 })),
      }),
      async ({ id, text, tags, addSources = [] }) => {
        await visibleNote(id)
        const added = await checkSources(addSources)
        const filed = tags ? await filedUnder(tags) : undefined
        const revised = await reviseMemory(id, note => ({
          ...note,
          text: text?.trim() ?? note.text,
          tags: filed ?? note.tags,
          sources: [
            ...note.sources,
            ...added.filter(item => !note.sources.some(existing => sameSource(existing, item))),
          ],
        }))
        if (!revised) throw new LocalToolError('The note was removed meanwhile.')
        return { id }
      },
    ),
    bind(
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
        const known =
          findTag(tags, name) ?? aliases.map(alias => findTag(tags, alias)).find(Boolean)
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
  ]
}
