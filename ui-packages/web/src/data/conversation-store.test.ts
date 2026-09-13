import { describe, expect, it } from 'vitest'
import { createReaderUserMessage } from '../core/agent/reader-message'
import { emptyConversationDraft, type StoredConversation } from '../core/conversations'
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
      [new File(['shared'], 'Shared.md', { type: 'text/markdown' })],
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
    expect((await listStoredFiles()).some(file => file.name === 'Shared.md')).toBe(true)
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
