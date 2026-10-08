import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { isReaderUserMessage } from '../../core/reader-message'
import { getStoredConversation } from '../../data/conversation-store'

export type TranscriptLine = { position: number; role: 'reader' | 'assistant'; text: string }

// What was said: the reader's own words and the assistant's text. Tool calls and their results,
// which carry document and web text, are left out, so nothing a page says is read as a memory.
const lineOf = (message: AgentMessage, position: number): TranscriptLine[] => {
  if (isReaderUserMessage(message))
    return message.reader.text.trim()
      ? [{ position, role: 'reader', text: message.reader.text }]
      : []
  if (message.role !== 'assistant') return []
  const text = message.content
    .flatMap(block => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim()
  return text ? [{ position, role: 'assistant', text }] : []
}

export const transcriptOf = (messages: readonly AgentMessage[]) =>
  messages.flatMap((message, position) => lineOf(message, position))

export const readerMessageCount = (messages: readonly AgentMessage[], from: number) =>
  messages.slice(from).filter(message => isReaderUserMessage(message)).length

const pageCharacters = 8000

// One page of a conversation from a message position, cut between messages; next is where the
// following page starts, or null at the end of the range.
export const readTranscript = async (
  conversationId: string,
  { from = 0, to = Number.POSITIVE_INFINITY }: { from?: number; to?: number },
) => {
  const stored = await getStoredConversation(conversationId)
  if (!stored) return null
  const lines = transcriptOf(stored.messages).filter(
    line => line.position >= from && line.position <= to,
  )
  // Lines up to the one that would pass the page size; the first line is always taken.
  const ends = lines.map((_, index) =>
    lines.slice(0, index + 1).reduce((size, line) => size + line.text.length, 0),
  )
  const cut = ends.findIndex((end, index) => index > 0 && end > pageCharacters)
  const page = cut < 0 ? lines : lines.slice(0, cut)
  const following = lines[page.length]
  return {
    title: stored.conversation.title,
    messageCount: stored.messages.length,
    lines: page,
    next: following ? following.position : null,
  }
}
