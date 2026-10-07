import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai'
import { createReaderUserMessage } from '../../../core/agent/reader-message'
import { emptyConversationDraft } from '../../../core/conversations'
import {
  appendStoredConversationMessages,
  saveStoredConversationDraft,
} from '../../../data/conversation-store'

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

export const reader = (text: string) => createReaderUserMessage(text, [])

export const answer = (text: string): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  api: 'openai-completions',
  provider: 'test',
  model: 'test',
  usage,
  stopReason: 'stop',
  timestamp: 0,
})

export const toolResult = (text: string): ToolResultMessage => ({
  role: 'toolResult',
  toolCallId: 'call',
  toolName: 'read',
  content: [{ type: 'text', text }],
  isError: false,
  timestamp: 0,
})

// A conversation saved in the open project, as the chat would have left it.
export const seedConversation = async (
  id: string,
  lastActiveAt: number,
  messages: readonly AgentMessage[],
) => {
  const conversation = {
    id,
    title: id,
    draft: emptyConversationDraft(),
    createdAt: lastActiveAt,
    lastActiveAt,
  }
  await saveStoredConversationDraft(conversation)
  await appendStoredConversationMessages({ conversation, startPosition: 0, messages })
}

export const runTool = async (tools: readonly AgentTool[], name: string, input: unknown) => {
  const tool = tools.find(candidate => candidate.name === name)
  if (!tool) throw new Error(`No tool ${name}`)
  const result = await tool.execute('call', input as never)
  const [content] = result.content
  return JSON.parse(content?.type === 'text' ? content.text : 'null')
}
