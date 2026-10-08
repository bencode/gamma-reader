import { Type } from '@earendil-works/pi-ai'
import { nanoid } from 'nanoid'
import { bind, LocalToolError } from '../../../core/agent/tool'
import type { MemoryEntry, MemoSource } from '../entry'
import { createMemoTools, filedUnder, visibleNote } from '../memo-tools'
import { markProgress, reviseMemory, saveMemory } from '../store'
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
  a.projectKey === b.projectKey &&
  a.conversationId === b.conversationId &&
  a.from === b.from &&
  a.to === b.to

export const createCuratorTools = (projectKey: string) => {
  // A source must name a stretch of one of this project's conversations.
  const checkSources = async (
    sources: readonly Omit<MemoSource, 'projectKey'>[],
  ): Promise<MemoSource[]> => {
    const checked = await Promise.all(
      sources.map(async item => {
        const page = await readTranscript(item.conversationId, {})
        if (!page)
          throw new LocalToolError(`No conversation ${item.conversationId} in this project.`)
        if (item.from > item.to || item.to >= page.messageCount)
          throw new LocalToolError(
            `Positions in ${item.conversationId} run from 0 to ${page.messageCount - 1}.`,
          )
        return { projectKey, ...item }
      }),
    )
    return checked
  }

  const memos = createMemoTools(projectKey)

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
    memos.listTags,
    memos.searchMemos,
    memos.readMemo,
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
          updatedAt: now,
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
        await visibleNote(projectKey, id)
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
    memos.defineTag,
  ]
}
