import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentSelection } from '@gamma-reader/server/agent-contract'
import type { ConversationAttachment } from './agent/reader-message'

export type ConversationId = string

export type ConversationDraft = {
  text: string
  attachments: ConversationAttachment[]
}

export type StoredConversation = {
  id: ConversationId
  title: string | null
  selection?: AgentSelection
  draft: ConversationDraft
  createdAt: number
  lastActiveAt: number
}

export type StoredConversationMessage = {
  conversationId: ConversationId
  position: number
  message: AgentMessage
}

export type ConversationCursor = readonly [lastActiveAt: number, conversationId: ConversationId]

export type ConversationPage = {
  items: StoredConversation[]
  nextCursor: ConversationCursor | null
}

export const emptyConversationDraft = (): ConversationDraft => ({ text: '', attachments: [] })

export const conversationTitle = (draft: ConversationDraft) => {
  const firstLine = draft.text.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ')
  const source = firstLine || draft.attachments[0]?.name || 'New conversation'
  const characters = Array.from(source)
  return characters.length > 60 ? `${characters.slice(0, 59).join('')}…` : source
}
