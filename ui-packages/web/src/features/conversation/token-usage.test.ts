import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Usage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { tokenUsage } from './token-usage'

const usage = (input: number, output: number, cacheRead = 0): Usage => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  totalTokens: input + output + cacheRead,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
})

const reply = (value: Usage): AgentMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: 'Answer' }],
  api: 'openai-completions',
  provider: 'zai-coding-cn',
  model: 'glm-5.3',
  usage: value,
  stopReason: 'stop',
  timestamp: 0,
})

describe('conversation token usage', () => {
  it('counts every model call and takes the context from the latest reply', () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'What is on page 3?', timestamp: 0 },
      reply(usage(1_000, 200)),
      {
        role: 'toolResult',
        toolCallId: 'page',
        toolName: 'analyze_pdf_page',
        content: [{ type: 'text', text: '{}' }],
        isError: false,
        usage: usage(5_000, 300),
        timestamp: 0,
      },
      reply(usage(500, 100, 1_200)),
    ]

    expect(tokenUsage(messages)).toEqual({
      context: 1_800,
      used: 8_300,
      input: 7_700,
      output: 600,
    })
    expect(tokenUsage(messages.slice(0, 1))).toBeNull()
  })
})
