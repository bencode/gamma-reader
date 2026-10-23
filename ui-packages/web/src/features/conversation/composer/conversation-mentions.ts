import {
  type ConversationId,
  conversationNumber,
  type StoredConversation,
} from '../../../core/conversations'
import { type MentionOption, mentionAt } from './mentions'

// Digits alone are a Lab cell, as in #3, so they open no list.
export const conversationMentionAt = (text: string, caret: number) => {
  const mention = mentionAt('#', text, caret)
  return mention && /^\d+$/.test(mention.query) ? null : mention
}

// A title that holds the query or a number that starts with it, most recently active first, as
// the conversations arrive. The conversation being written in is left out, and so is one never
// sent, which has no title yet and nothing to read.
export const rankConversations = (
  conversations: readonly StoredConversation[],
  query: string,
  activeId: ConversationId,
) => {
  const lowered = query.toLowerCase()
  return conversations
    .filter(
      conversation =>
        conversation.id !== activeId &&
        conversation.title !== null &&
        (conversation.title.toLowerCase().includes(lowered) ||
          conversationNumber(conversation.id).toLowerCase().startsWith(lowered)),
    )
    .slice(0, 8)
}

export const conversationOption = (conversation: StoredConversation): MentionOption => {
  const number = `#${conversationNumber(conversation.id)}`
  const title = conversation.title ?? number
  return { id: conversation.id, name: title, detail: number, title }
}
