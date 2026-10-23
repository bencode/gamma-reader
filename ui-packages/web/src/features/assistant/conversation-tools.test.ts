import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import type { CompactionMessage } from '../../core/agent/compaction'
import { LocalToolError } from '../../core/agent/tool'
import { emptyConversationDraft } from '../../core/conversations'
import { createReaderUserMessage } from '../../core/reader-message'
import { appendStoredConversationMessages } from '../../data/conversation-store'
import { createConversationTools } from './conversation-tools'

const assistant = (text: string, call?: string): AssistantMessage => ({
  role: 'assistant',
  content: [
    { type: 'text', text },
    ...(call ? [{ type: 'toolCall' as const, id: call, name: 'read', arguments: {} }] : []),
  ],
  api: 'openai-completions',
  provider: 'test',
  model: 'test',
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: call ? 'toolUse' : 'stop',
  timestamp: 1,
})

const toolResult: ToolResultMessage = {
  role: 'toolResult',
  toolCallId: 'call-1',
  toolName: 'read',
  content: [{ type: 'text', text: 'The whole chapter' }],
  isError: false,
  timestamp: 1,
}

const compaction: CompactionMessage = {
  role: 'compaction',
  summary: 'Earlier talk',
  firstKept: 0,
  tokensBefore: 0,
  usages: [],
  timestamp: 1,
}

const store = (id: string, title: string, messages: AgentMessage[]) =>
  appendStoredConversationMessages({
    conversation: { id, title, draft: emptyConversationDraft(), createdAt: 1, lastActiveAt: 1 },
    startPosition: 0,
    messages,
  })

type Page = { conversation: string; title: string; messages: { text: string }[]; next: object }

const read = async (input: { conversation: string; cursor?: string }) => {
  const [tool] = createConversationTools()
  const result = await tool?.execute('call', input)
  const content = result?.content[0]
  return JSON.parse(content?.type === 'text' ? content.text : 'null') as Page
}

describe('read_conversation', () => {
  it("reads the reader's messages and the answers by number, page by page", async () => {
    const attachment = {
      id: 'file-1',
      name: 'Chapter.md',
      mediaType: 'text/markdown',
      previewKind: 'markdown' as const,
      size: 1,
    }
    await store('k3X9qA-whole-id', 'Reading chapter one', [
      createReaderUserMessage('What does it argue?', [attachment]),
      assistant('Let me read it.', 'call-1'),
      toolResult,
      compaction,
      // A reply that failed to connect.
      assistant(''),
      assistant('It argues for patience.'),
    ])

    const page = await read({ conversation: '#k3X9qA' })

    expect(page).toEqual({
      conversation: '#k3X9qA',
      title: 'Reading chapter one',
      total: 3,
      messages: [
        { role: 'user', text: 'What does it argue?', attachments: ['Chapter.md'] },
        { role: 'assistant', text: 'Let me read it.', tools: ['read'] },
        { role: 'assistant', text: 'It argues for patience.' },
      ],
      next: null,
    })

    const long = Array.from({ length: 40 }, (_, index) => `${index} ${'word '.repeat(200)}`)
    await store(
      'long00-whole-id',
      'Long talk',
      long.map(text => assistant(text)),
    )
    const texts: string[] = []
    let input: { conversation: string; cursor?: string } | null = { conversation: '#long00' }
    while (input) {
      const next: Page = await read(input)
      texts.push(...next.messages.map(message => message.text))
      input = next.next as typeof input
    }
    expect(texts).toEqual(long)
  })

  it('names what is missing, and asks for the whole id when a number is shared', async () => {
    await store('abcdef-first', 'First', [assistant('One')])
    await store('abcdef-second', 'Second', [assistant('Two')])

    await expect(read({ conversation: '#zzzzzz' })).rejects.toThrow(LocalToolError)
    await expect(read({ conversation: '#abcdef' })).rejects.toThrow(/Pass the whole id/)
    expect((await read({ conversation: 'abcdef-second' })).title).toBe('Second')
  })
})
