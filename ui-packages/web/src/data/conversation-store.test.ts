import { describe, expect, it } from 'vitest'
import { createReaderUserMessage } from '../core/agent/reader-message'
import { emptyConversationDraft, type StoredConversation } from '../core/conversations'
import { rootSources } from '../core/files'
import {
  appendStoredConversationMessages,
  getStoredConversation,
  listStoredConversations,
  removeStoredConversation,
  saveStoredConversationDraft,
} from './conversation-store'
import { importStoredFiles, listStoredFiles } from './file-store'

const conversation = (
  id: string,
  lastActiveAt: number,
  title: string | null = id,
): StoredConversation => ({
  id,
  title,
  draft: emptyConversationDraft(),
  createdAt: lastActiveAt,
  lastActiveAt,
})

describe('conversation store', () => {
  it('stores drafts and ordered Pi messages, then deletes only the conversation', async () => {
    const imported = await importStoredFiles(
      rootSources([new File(['shared'], 'Shared.md', { type: 'text/markdown' })]),
      'keep',
    )
    const stored = {
      ...conversation('conversation-a', 10, null),
      draft: {
        text: 'Continue here',
        attachments: [
          {
            id: imported.addedIds[0] ?? 'missing',
            name: 'Shared.md',
            mediaType: 'text/markdown',
            previewKind: 'markdown' as const,
            size: 6,
          },
        ],
      },
    }
    await saveStoredConversationDraft(stored)
    const first = createReaderUserMessage('First', [])
    const second = createReaderUserMessage('Second', stored.draft.attachments)
    await appendStoredConversationMessages({
      conversation: stored,
      startPosition: 0,
      messages: [first, second],
    })

    expect(await getStoredConversation(stored.id)).toEqual({
      conversation: stored,
      messages: [first, second],
    })

    await removeStoredConversation(stored.id)
    expect(await getStoredConversation(stored.id)).toBeNull()
    expect((await listStoredFiles()).some(file => file.path === 'Shared.md')).toBe(true)
  })

  it('opens a conversation with its unsent queue returned to the draft', async () => {
    await saveStoredConversationDraft({
      ...conversation('queued', 10),
      draft: { text: 'Still typing', attachments: [] },
      queued: [
        { text: 'First queued', attachments: [] },
        { text: 'Second queued', attachments: [] },
      ],
    })

    const opened = await getStoredConversation('queued')

    expect(opened?.conversation.draft.text).toBe('First queued\n\nSecond queued\n\nStill typing')
    expect(opened?.conversation.queued).toEqual([])
  })

  it('pages by activity and id without duplicates when timestamps match', async () => {
    await Promise.all(
      Array.from({ length: 65 }, (_, index) =>
        saveStoredConversationDraft(
          conversation(`conversation-${String(index).padStart(2, '0')}`, 7),
        ),
      ),
    )

    const first = await listStoredConversations()
    const second = await listStoredConversations({ before: first.nextCursor })
    const third = await listStoredConversations({ before: second.nextCursor })
    const ids = [...first.items, ...second.items, ...third.items].map(item => item.id)

    expect(first.items).toHaveLength(30)
    expect(second.items).toHaveLength(30)
    expect(third.items).toHaveLength(5)
    expect(new Set(ids)).toHaveLength(65)
    expect(ids).toEqual([...ids].sort().reverse())
    expect(third.nextCursor).toBeNull()
  })
})
