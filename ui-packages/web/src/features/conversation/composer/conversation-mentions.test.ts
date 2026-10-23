import { describe, expect, it } from 'vitest'
import { emptyConversationDraft, type StoredConversation } from '../../../core/conversations'
import { conversationMentionAt, rankConversations } from './conversation-mentions'

const conversation = (id: string, title: string | null): StoredConversation => ({
  id,
  title,
  draft: emptyConversationDraft(),
  createdAt: 1,
  lastActiveAt: 1,
})

const at = (text: string) => conversationMentionAt(text, text.length)

describe('conversation mentions', () => {
  it('opens on a # that starts a word, but not on a Lab cell, and lists the other conversations', () => {
    expect(at('#')).toEqual({ start: 0, query: '' })
    expect(at('另外，#rea')).toEqual({ start: 3, query: 'rea' })
    expect(at('see #k3X')).toEqual({ start: 4, query: 'k3X' })
    expect(at('C#')).toBeNull()
    expect(at('Page#Heading')).toBeNull()
    expect(at('look at #3')).toBeNull()

    const conversations = [
      conversation('active-id', 'Reading now'),
      conversation('k3X9qA-id', 'Reading chapter one'),
      conversation('unsent-id', null),
      conversation('readAb-id', 'Notes'),
    ]
    const ids = (query: string) =>
      rankConversations(conversations, query, 'active-id').map(item => item.id)
    expect(ids('')).toEqual(['k3X9qA-id', 'readAb-id'])
    expect(ids('READ')).toEqual(['k3X9qA-id', 'readAb-id'])
    expect(ids('k3x')).toEqual(['k3X9qA-id'])
  })
})
