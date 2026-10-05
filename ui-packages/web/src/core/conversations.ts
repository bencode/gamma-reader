import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ModelThinkingLevel } from '@earendil-works/pi-ai'
import type { ModelReference } from '@gamma-reader/shared/model-config'
import type { ConversationAttachment } from './agent/reader-message'

export type ConversationId = string

export type ModelSelection = ModelReference & { effort: ModelThinkingLevel }

export type ConversationDraft = {
  text: string
  attachments: ConversationAttachment[]
}

// Absent means the title was cut from the first message; the model or the reader replaces it.
export type TitleSource = 'model' | 'reader'

export type StoredConversation = {
  id: ConversationId
  title: string | null
  titledBy?: TitleSource
  selection?: ModelSelection
  // Whether the reader turned web search on for this conversation; off when absent.
  webSearch?: boolean
  draft: ConversationDraft
  // Sent while a reply was running and not yet given to the model.
  queued?: ConversationDraft[]
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

// Queued messages were written before the draft, so they come first.
export const foldQueued = (
  draft: ConversationDraft,
  queued: readonly ConversationDraft[],
): ConversationDraft => ({
  text: [...queued.map(item => item.text), draft.text].filter(text => text.trim()).join('\n\n'),
  attachments: [...queued.flatMap(item => item.attachments), ...draft.attachments],
})

// A queue only means something while its reply runs; a conversation opened later gets it back as
// its draft.
export const returnQueuedToDraft = (conversation: StoredConversation): StoredConversation =>
  conversation.queued?.length
    ? { ...conversation, draft: foldQueued(conversation.draft, conversation.queued), queued: [] }
    : conversation

export const conversationTitle = (draft: ConversationDraft) => {
  const firstLine = draft.text.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, ' ')
  const source = firstLine || draft.attachments[0]?.name || 'New conversation'
  const characters = Array.from(source)
  return characters.length > 60 ? `${characters.slice(0, 59).join('')}…` : source
}
