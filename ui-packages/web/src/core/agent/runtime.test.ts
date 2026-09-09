import { describe, expect, it, vi } from 'vitest'
import { importStoredFiles } from '../../data/file-store'
import type { ReaderState } from '../local-tool-types'
import { createLocalTools } from '../local-tools'
import { createReaderAgent } from './runtime'

const config = { enabled: true, provider: 'zai-coding-cn', modelId: 'glm-5.3' } as const
const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'reply', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const reply = (text: string) =>
  new Response(`${event({ content: text }) + event({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
const call = (name: string, args: unknown) =>
  new Response(
    `${event(
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
    )}data: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
const emptyState = (): ReaderState => ({ openFiles: [], activeFile: null, viewport: null })

describe('reader agent', () => {
  it('runs local tools through Pi and supplies context only after a tool request', async () => {
    const imported = await importStoredFiles(
      [new File(['# Local secret\n\nThe fox reads quietly.'], 'private.md')],
      'keep',
    )
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error('Missing fixture')
    const state: ReaderState = {
      openFiles: [{ id: fileId, name: 'private.md' }],
      activeFile: { id: fileId, name: 'private.md' },
      viewport: { startText: 'The fox', endText: 'quietly.' },
    }
    const requests: { messages: { role: string; content: string; tool_call_id?: string }[] }[] = []
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      requests.push(body)
      if (requests.length === 1) return call('get_reader_state', {})
      if (requests.length === 2) return call('list', {})
      if (requests.length === 3) return call('search', { query: 'The fox', fileId })
      if (requests.length === 4) {
        const found = JSON.parse(body.messages.at(-1).content).matches[0]
        return call('read', { fileId: found.fileId, range: found.range })
      }
      return reply('The fox reads quietly.')
    })
    const agent = createReaderAgent(
      config,
      createLocalTools(() => state),
    )
    await agent.prompt('Explain the current paragraph')
    expect(requests).toHaveLength(5)
    expect(requests[0]?.messages.filter(message => message.role !== 'system')).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Explain the current paragraph' }] },
    ])
    expect(JSON.stringify(requests[0])).not.toContain('private.md')
    expect(JSON.stringify(requests[0])).not.toContain('Local secret')
    expect(
      requests[4]?.messages
        .filter(message => message.role === 'tool')
        .map(message => message.tool_call_id),
    ).toEqual(['call-get_reader_state', 'call-list', 'call-search', 'call-read'])
    expect(requests[4]?.messages.at(-1)?.content).toContain('The fox reads quietly.')
    expect(fetchModel.mock.calls[0]?.[0].toString()).toContain('/api/agent/chat/completions')
    state.activeFile = null
    fetchModel
      .mockResolvedValueOnce(call('get_reader_state', {}))
      .mockResolvedValueOnce(reply('No active file.'))
    await agent.prompt('What about now?')
    const result = agent.state.messages.findLast(message => message.role === 'toolResult')
    expect(result).toMatchObject({ content: [{ type: 'text', text: JSON.stringify(state) }] })
    expect(agent.state.messages.filter(message => message.role === 'user')).toHaveLength(2)
    expect(createReaderAgent(config, createLocalTools(emptyState)).state.messages).toEqual([])
  })

  it('returns tool errors to the model without hiding a failed read', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(call('read', { fileId: 'missing' }))
      .mockResolvedValueOnce(reply('The file is unavailable.'))
    const agent = createReaderAgent(config, createLocalTools(emptyState))
    await agent.prompt('Read the file')
    expect(agent.state.messages.find(message => message.role === 'toolResult')).toMatchObject({
      isError: true,
    })
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })

  it('aborts generation and skips later queued tools', async () => {
    const local = createLocalTools(emptyState)
    const search = vi.spyOn(local, 'search')
    const toolsResponse = new Response(
      `${event(
        {
          tool_calls: ['list', 'search'].map((name, index) => ({
            index,
            id: name,
            type: 'function',
            function: {
              name,
              arguments: JSON.stringify(name === 'search' ? { query: 'fox' } : {}),
            },
          })),
        },
        'tool_calls',
      )}data: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(toolsResponse)
    const agent = createReaderAgent(config, local)
    agent.subscribe(event => {
      if (event.type === 'tool_execution_start') agent.abort()
    })
    await agent.prompt('Search the files')
    expect(search).not.toHaveBeenCalled()
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('does not automatically retry provider errors and can accept a later question', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }))
      .mockResolvedValueOnce(reply('Recovered'))
    const agent = createReaderAgent(config, createLocalTools(emptyState))
    await agent.prompt('Hello')
    expect(fetchModel).toHaveBeenCalledTimes(1)
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'error' })
    await agent.prompt('Try again')
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'stop' })
  })
})
