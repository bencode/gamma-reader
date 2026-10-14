import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Message, ToolResultMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import {
  autoCompactionEnabled,
  type CompactionMessage,
  compactionThreshold,
  keepRecentFor,
  needsCompaction,
  planCompaction,
  projectContext,
} from './compaction'

const user = (text: string): Message => ({ role: 'user', content: text, timestamp: 1 })

const assistant = (text: string, call?: string): AssistantMessage => ({
  role: 'assistant',
  content: [
    ...(text ? [{ type: 'text' as const, text }] : []),
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

const result = (call: string, text: string): ToolResultMessage => ({
  role: 'toolResult',
  toolCallId: call,
  toolName: 'read',
  content: [{ type: 'text', text }],
  isError: false,
  timestamp: 1,
})

const compaction = (summary: string, firstKept: number): CompactionMessage => ({
  role: 'compaction',
  summary,
  firstKept,
  tokensBefore: 0,
  usages: [],
  timestamp: 2,
})

const system: Message = { role: 'system', content: 'You help a reader.', timestamp: 0 }

const summaryText = (message: Message | undefined) =>
  message?.role === 'user' && typeof message.content !== 'string'
    ? message.content.map(block => (block.type === 'text' ? block.text : '')).join('')
    : ''

describe('projectContext', () => {
  it('sends the summary in place of the messages before the kept range', () => {
    const toolsChanged: Message = { role: 'system', content: '', toolsRemoved: [], timestamp: 1 }
    const messages: AgentMessage[] = [
      system,
      user('one'),
      assistant('a'),
      toolsChanged,
      user('two'),
      assistant('b'),
      compaction('earlier: one, a', 2),
      user('three'),
    ]

    const projected = projectContext(messages)

    expect(projected[0]).toBe(system)
    expect(projected[1]).toBe(toolsChanged)
    expect(summaryText(projected[2])).toContain('<summary>\nearlier: one, a\n</summary>')
    expect(projected.slice(3)).toEqual([user('two'), assistant('b'), user('three')])
    expect(projectContext([system, user('one')])).toEqual([system, user('one')])
  })

  it('leaves out an older compaction inside the kept range', () => {
    const messages: AgentMessage[] = [
      user('one'),
      assistant('a'),
      compaction('first', 0),
      user('two'),
      compaction('second', 1),
    ]

    const projected = projectContext(messages)

    expect(projected).toHaveLength(3)
    expect(summaryText(projected[0])).toContain('second')
    expect(projected.slice(1)).toEqual([assistant('a'), user('two')])
  })
})

describe('planCompaction', () => {
  it('cuts at the user message that reaches the budget', () => {
    const turn = (text: string) => [user(text.repeat(400)), assistant(text.repeat(400))]
    const messages = [...turn('x'), ...turn('y')]

    expect(planCompaction(messages, 150)).toMatchObject({
      firstKept: 2,
      history: messages.slice(0, 2),
      turnPrefix: [],
    })
  })

  // pi #9740: trailing tool results larger than the budget keep the call they answer, and the
  // start of that turn is summarized on its own.
  it('keeps the tool call when its result alone passes the budget', () => {
    const messages = [
      user('old history'),
      assistant('old answer'),
      user('read the large file'),
      assistant('', 'call'),
      result('call', 'x'.repeat(8000)),
    ]

    expect(planCompaction(messages, 1000)).toMatchObject({
      firstKept: 3,
      history: [messages[0], messages[1]],
      turnPrefix: [messages[2]],
    })
  })

  it('continues from the previous summary and the messages it kept', () => {
    const messages: AgentMessage[] = [
      user('x'.repeat(400)),
      assistant('y'.repeat(400)),
      compaction('first', 1),
      user('z'.repeat(400)),
      assistant('w'.repeat(400)),
    ]

    expect(planCompaction(messages, 150)).toMatchObject({
      firstKept: 3,
      history: [messages[1]],
      previousSummary: 'first',
    })
  })

  it('has nothing to do right after a compaction or within the budget', () => {
    const messages = [user('one'), assistant('a')]

    expect(planCompaction(messages, 1000)).toBeNull()
    expect(planCompaction([...messages, compaction('done', 1)], 0)).toBeNull()
  })
})

describe('when to compact', () => {
  it('scales the threshold and what is kept with the window', () => {
    const budget = (window: number) => [compactionThreshold(window), keepRecentFor(window)]

    expect(budget(1_000_000)).toEqual([512_000, 40_000])
    expect(budget(128_000)).toEqual([111_616, 40_000])
    expect(budget(32_000)).toEqual([16_000, 6_400])
    expect(budget(8_000)).toEqual([4_000, 1_600])
    // A window the catalog does not know.
    expect(budget(0)).toEqual([512_000, 40_000])
  })

  it('compacts once the context passes the threshold, and not again after', () => {
    const window = 128_000
    const messages: AgentMessage[] = [
      user('x'.repeat(400_000)),
      assistant('y'.repeat(400_000)),
      user('z'.repeat(400)),
    ]

    expect(needsCompaction(messages, window)).toBe(true)
    expect(needsCompaction([...messages, compaction('short', 2)], window)).toBe(false)
  })

  it('automates only known windows of at least 128K', () => {
    const messages = [user('x'.repeat(2_000_000))]
    const smallWindows = [0, 32_000, 127_999]
    smallWindows.forEach(window => {
      expect(autoCompactionEnabled(window)).toBe(false)
      expect(needsCompaction(messages, window)).toBe(false)
    })
    const supportedWindows = [128_000, 1_000_000]
    supportedWindows.forEach(window => {
      expect(autoCompactionEnabled(window)).toBe(true)
      expect(needsCompaction(messages, window)).toBe(true)
    })
  })
})
