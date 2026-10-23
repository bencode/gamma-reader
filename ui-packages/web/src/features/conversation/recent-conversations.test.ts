import { describe, expect, it } from 'vitest'
import { emptyConversationDraft, type StoredConversation } from '../../core/conversations'
import { keepOrder, recentConversations } from './recent-conversations'

const conversation = (id: string, title: string | null = id): StoredConversation => ({
  id,
  title,
  draft: emptyConversationDraft(),
  createdAt: 1,
  lastActiveAt: 1,
})

const ids = (items: readonly StoredConversation[]) => items.map(item => item.id)

describe('recent conversations', () => {
  it('lists the latest ten, keeps an older one that is open or answering, and holds rows still', () => {
    const items = Array.from({ length: 14 }, (_, index) => conversation(`c${index}`))
    const latest = ids(items.slice(0, 10))

    expect(ids(recentConversations(items, conversation('c3', 'Renamed'), {}))).toEqual(latest)
    expect(recentConversations(items, conversation('c3', 'Renamed'), {})[3]?.title).toBe('Renamed')
    expect(ids(recentConversations(items, conversation('c12'), { c11: 'running' }))).toEqual([
      ...latest,
      'c11',
      'c12',
    ])
    expect(
      ids(recentConversations(items, conversation('unsaved', null), { c13: 'unread' })),
    ).toEqual(['unsaved', ...latest])

    const opened = recentConversations(items.slice(0, 3), items[0] ?? conversation('c0'), {})
    const reordered = [conversation('new'), items[2], items[0], items[1]].flatMap(item =>
      item ? [item] : [],
    )
    expect(ids(keepOrder(ids(opened), reordered))).toEqual(['new', 'c0', 'c1', 'c2'])
  })
})
