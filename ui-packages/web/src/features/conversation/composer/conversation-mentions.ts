import {
  type ConversationId,
  conversationNumber,
  type StoredConversation,
} from '../../../core/conversations'
import type { Mention } from './file-mentions'
import type { MentionOption } from './mention-menu'

// A # names a conversation by its number, under the rule an @ follows: not after a letter or
// digit, as in C# or Page#Heading. Digits alone are a Lab cell, as in #3, so they open no list.
const mentionBeforeCaret = /(?<![A-Za-z0-9._%+-])#([^\s#]*)$/

export const conversationMentionAt = (text: string, caret: number): Mention | null => {
  const match = mentionBeforeCaret.exec(text.slice(0, caret))
  const query = match?.[1]
  if (query === undefined || /^\d+$/.test(query)) return null
  return { start: caret - query.length - 1, query }
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
