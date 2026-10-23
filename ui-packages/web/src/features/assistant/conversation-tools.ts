import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { bind, LocalToolError } from '../../core/agent/tool'
import { conversationNumber } from '../../core/conversations'
import { isReaderUserMessage } from '../../core/reader-message'
import { findStoredConversations, getStoredConversation } from '../../data/conversation-store'
import { boundedText, paginate } from './pagination'

type ConversationEntry = {
  role: 'user' | 'assistant'
  text: string
  attachments?: string[]
  tools?: string[]
  truncated?: true
}

// One long message must not take a whole page.
const maximumMessageBytes = 8 * 1024

const entry = (
  role: ConversationEntry['role'],
  text: string,
  extra: Pick<ConversationEntry, 'attachments' | 'tools'>,
): ConversationEntry => {
  const bounded = boundedText(text, maximumMessageBytes)
  return { role, text: bounded, ...extra, ...(bounded !== text ? { truncated: true } : {}) }
}

// What the reader wrote and what the assistant answered. Tool results, summaries and the
// metadata a message carries for the model are left out.
const conversationEntries = (messages: readonly AgentMessage[]) =>
  messages.flatMap((message): ConversationEntry[] => {
    if (isReaderUserMessage(message)) {
      const attachments = message.reader.attachments.map(item => item.name)
      return [entry('user', message.reader.text, attachments.length ? { attachments } : {})]
    }
    if (message.role === 'user')
      return [
        entry(
          'user',
          typeof message.content === 'string'
            ? message.content
            : message.content.flatMap(part => (part.type === 'text' ? [part.text] : [])).join(''),
          {},
        ),
      ]
    if (message.role !== 'assistant') return []
    const text = message.content.flatMap(part => (part.type === 'text' ? [part.text] : [])).join('')
    const tools = message.content.flatMap(part => (part.type === 'toolCall' ? [part.name] : []))
    // A reply that failed before it said or did anything has nothing to read.
    if (!text.trim() && !tools.length) return []
    return [entry('assistant', text, tools.length ? { tools } : {})]
  })

const findConversation = async (name: string) => {
  const prefix = name.trim().replace(/^#/, '')
  if (prefix.length < 6)
    throw new LocalToolError('A conversation number has six characters, such as #k3X9qA.')
  const found = await findStoredConversations(prefix)
  if (found.length > 1)
    throw new LocalToolError(
      `#${prefix} names several conversations: ${found
        .map(item => `${item.id} (${item.title ?? 'untitled'})`)
        .join(', ')}. Pass the whole id.`,
    )
  const stored = found[0] ? await getStoredConversation(found[0].id) : null
  if (!stored) throw new LocalToolError(`No conversation #${prefix} in this project.`)
  return stored
}

export const createConversationTools = () => [
  bind(
    'read_conversation',
    "Read another conversation of this project by its number, written as # and six characters such as #k3X9qA, or by its whole id. Returns the reader's messages and the assistant's answers in order, with the names of the tools each answer used; tool results are left out. Follow next to continue.",
    Type.Object({
      conversation: Type.String({
        minLength: 6,
        description: 'The conversation number, such as #k3X9qA, or its whole id.',
      }),
      cursor: Type.Optional(
        Type.String({ description: 'Opaque cursor from next. Copy it unchanged.' }),
      ),
    }),
    async input => {
      const { conversation, messages } = await findConversation(input.conversation)
      return paginate(
        'read_conversation',
        input,
        conversationEntries(messages),
        (entries, next, total) => ({
          conversation: `#${conversationNumber(conversation.id)}`,
          title: conversation.title,
          total,
          messages: entries,
          next,
        }),
      )
    },
  ),
]
