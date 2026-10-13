import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import { readableProxyError } from '../../../core/models/proxy-error'
import { type ConversationAttachment, isReaderUserMessage } from '../../../core/reader-message'

export type ToolStatus = 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Stopped'
export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant' | 'compaction'
  text: string
  attachments: ConversationAttachment[]
  tools: { id: string; name: string; status: ToolStatus }[]
  notice?: string
  failed?: boolean
  copyable?: boolean
}

export const statusMap = (messages: readonly AgentMessage[]) => {
  const statuses = new Map<string, ToolStatus>()
  messages.forEach(message => {
    if (message.role === 'assistant')
      message.content.forEach(block => {
        if (block.type === 'toolCall') statuses.set(block.id, 'Stopped')
      })
    if (message.role === 'toolResult')
      statuses.set(message.toolCallId, message.isError ? 'Failed' : 'Completed')
  })
  return statuses
}

const snapshot = (
  message: AgentMessage,
  index: number,
  statuses: ReadonlyMap<string, ToolStatus>,
): ConversationMessage[] => {
  if (message.role === 'compaction')
    return [
      {
        id: `compaction:${index}`,
        role: 'compaction',
        text: message.summary,
        attachments: [],
        tools: [],
      },
    ]
  if (message.role !== 'user' && message.role !== 'assistant') return []
  const blocks =
    typeof message.content === 'string'
      ? [{ type: 'text' as const, text: message.content }]
      : message.content
  const text = blocks.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  const tools = blocks.flatMap(block =>
    block.type === 'toolCall'
      ? [{ id: block.id, name: block.name, status: statuses.get(block.id) ?? 'Pending' }]
      : [],
  )
  if (message.role === 'user') {
    const reader = isReaderUserMessage(message) ? message.reader : null
    return [
      {
        id: reader?.id ?? `user:${index}`,
        role: 'user',
        text: reader?.text ?? text,
        attachments: reader?.attachments ?? [],
        tools,
      },
    ]
  }
  const notice =
    message.stopReason === 'aborted'
      ? 'Generation stopped.'
      : message.stopReason === 'error'
        ? readableProxyError(message.errorMessage) ||
          'Could not generate a reply. Send a message to try again.'
        : message.stopReason === 'length'
          ? 'The response reached its output limit.'
          : undefined
  return [
    {
      id: `assistant:${index}`,
      role: 'assistant',
      text,
      attachments: [],
      tools,
      notice,
      failed: message.stopReason === 'error',
      copyable: message.stopReason === 'stop' || message.stopReason === 'length',
    },
  ]
}

// A turn that ended this way stops the run, so the library would never read a steered message.
export const runContinues = (message: AgentMessage) =>
  message.role === 'assistant' && message.stopReason !== 'error' && message.stopReason !== 'aborted'

export const failedRun = (agent: Agent) => {
  const last = agent.state.messages.at(-1)
  return last?.role === 'assistant' && last.stopReason === 'error'
}

export const displayMessages = (
  messages: readonly AgentMessage[],
  statuses: ReadonlyMap<string, ToolStatus>,
) => messages.flatMap((message, index) => snapshot(message, index, statuses))
