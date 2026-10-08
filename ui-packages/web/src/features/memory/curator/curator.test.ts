import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runBackgroundAgent } from '../../../core/agent/background'
import { workspaceDatabaseName } from '../../../data/workspace-database'
import { modelConfig } from '../../../test/model-config'
import { setMemoryEnabled } from '../settings'
import { listMemories, listTags, readProgress } from '../store'
import { curatorAgent } from './agent'
import { answer, reader, seedConversation } from './fixtures'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'reply', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const stream = (body: string) =>
  new Response(`${body}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
const reply = (text: string) => stream(event({ content: text }) + event({}, 'stop'))
const call = (name: string, args: unknown) =>
  stream(
    event(
      {
        tool_calls: [
          {
            index: 0,
            id: `call-${name}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
      'tool_calls',
    ),
  )

// The steps a curator takes for one conversation, as a model would ask for them.
const script = [
  call('list_pending_conversations', {}),
  call('read_conversation', { id: 'sicp', from: 0 }),
  call('define_tag', {
    name: 'SICP',
    aliases: ['计算机程序的构造和解释'],
    description: 'The book',
  }),
  call('write_memo', {
    text: '读者在读 SICP 1.2，尾递归仍是难点',
    scope: 'project',
    tags: ['SICP'],
    sources: [{ conversationId: 'sicp', from: 0, to: 4 }],
  }),
  call('mark_organized', { id: 'sicp', through: 4 }),
  reply('Organized one conversation.'),
]

describe('curator', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: unknown, run: (lock: object) => unknown) => run({}),
      },
    })
  })
  afterEach(() => setMemoryEnabled(false))

  it('turns a conversation into a note with its source and tag, and marks it done', async () => {
    const requests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/agent/config') return Response.json(modelConfig)
      requests.push(String(init?.body))
      return script[requests.length - 1] ?? reply('done')
    })
    setMemoryEnabled(true)
    await seedConversation('sicp', Date.now() - 60 * 60 * 1000, [
      reader('SICP 1.2 的迭代过程我看懂了'),
      answer('很好'),
      reader('但尾递归为什么不占栈？'),
      answer('因为……'),
      reader('还是不太明白'),
    ])

    const run = await runBackgroundAgent(curatorAgent, workspaceDatabaseName())

    expect(run).toMatchObject({ turns: 6 })
    expect(requests[0]).toContain('long-term memory')
    expect(await listMemories()).toEqual([
      expect.objectContaining({
        text: '读者在读 SICP 1.2，尾递归仍是难点',
        tags: ['SICP'],
        sources: [{ projectKey: 'gamma-reader-files', conversationId: 'sicp', from: 0, to: 4 }],
      }),
    ])
    expect(await listTags()).toEqual([
      { name: 'SICP', aliases: ['计算机程序的构造和解释'], description: 'The book' },
    ])
    expect(await readProgress('gamma-reader-files')).toEqual(new Map([['sicp', 5]]))
  })

  it('does nothing while memory is off', async () => {
    const fetchModel = vi.spyOn(globalThis, 'fetch')
    expect(await runBackgroundAgent(curatorAgent, workspaceDatabaseName())).toBeNull()
    expect(fetchModel).not.toHaveBeenCalled()
  })
})
