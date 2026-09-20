import type { PDFDocumentProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { createReaderUserMessage } from '../../core/agent/reader-message'
import type { ReaderState } from '../../core/reader-state'
import {
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  writeStoredTextFile,
} from '../../data/file-store'
import { modelConfig } from '../../test/model-config'
import { resolveModelSelection } from '../conversation/model-selection'
import { createReaderAgent } from './create-reader-agent'
import { createLocalTools } from './local-tools'
import { createModelRuntime } from './model-runtime'

const pdfTools = vi.hoisted(() => ({ destroy: vi.fn(), render: vi.fn(), read: vi.fn() }))
vi.mock('./pdf/source', () => ({
  openPdfSource: async () => ({
    pageCount: 3,
    destroyed: false,
    destroy: async () => {
      pdfTools.destroy()
    },
    readPage: async (number: number) => {
      pdfTools.read(number)
      return `Text from page ${number}`
    },
    renderPage: async (number: number) => {
      pdfTools.render(number)
      return new Blob(['pdf-page-image'], { type: 'image/png' })
    },
    withDocument: async <T>(read: (pdf: PDFDocumentProxy) => Promise<T>) =>
      read({
        numPages: 3,
        getMetadata: async () => ({ info: { Title: 'PDF sample' } }),
      } as unknown as PDFDocumentProxy),
  }),
}))

const config = createModelRuntime(modelConfig)
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
const localTools = () => createLocalTools(emptyState, writeStoredTextFile)
const session = { id: 'test-conversation', messages: [], ...resolveModelSelection(config) }

describe('reader agent', () => {
  it('restores the transcript under the selected conversation id', () => {
    const message = createReaderUserMessage('Earlier question', [])
    const agent = createReaderAgent(config, localTools(), {
      ...session,
      id: 'restored-conversation',
      messages: [message],
    })

    expect(agent.sessionId).toBe('restored-conversation')
    expect(agent.state.messages).toEqual([message])
  })

  it('sends the restored transcript as context for the next prompt', async () => {
    const requests: Array<{ messages: Array<{ role: string; content: unknown }> }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      return reply(requests.length === 1 ? 'Earlier answer' : 'Follow-up answer')
    })
    const first = createReaderAgent(config, localTools(), {
      ...session,
      id: 'restored-context',
      messages: [],
    })
    await first.prompt(createReaderUserMessage('Earlier question', []))
    const restored = createReaderAgent(config, localTools(), {
      ...session,
      id: 'restored-context',
      messages: first.state.messages,
    })

    await restored.prompt(createReaderUserMessage('Follow-up question', []))

    const context = requests[1]?.messages.filter(message => message.role !== 'system')
    expect(context?.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(context?.map(message => JSON.stringify(message.content))).toEqual([
      expect.stringContaining('Earlier question'),
      expect.stringContaining('Earlier answer'),
      expect.stringContaining('Follow-up question'),
    ])
  })

  it('writes a browser-local text file through the native Pi tool', async () => {
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = []
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      requests.push(body)
      if (requests.length === 1)
        return call('write', { path: 'Study notes.html', content: '<main>Saved</main>' })
      return reply('Saved as Study notes.html.')
    })
    const writer = vi.fn(writeStoredTextFile)
    const agent = createReaderAgent(config, createLocalTools(emptyState, writer), session)

    await agent.prompt('Save this as an HTML file')

    expect(writer).toHaveBeenCalledWith(
      'Study notes.html',
      '<main>Saved</main>',
      expect.any(AbortSignal),
    )
    const written = (await listStoredFiles()).find(file => file.name === 'Study notes.html')
    if (!written) throw new Error('Written file is missing')
    expect(written.previewKind).toBe('html')
    expect(await (await getStoredFileContent(written.id))?.text()).toBe('<main>Saved</main>')
    expect(requests[1]?.messages.at(-1)?.content).toContain('Successfully wrote')
    expect(agent.state.messages.findLast(message => message.role === 'toolResult')).toMatchObject({
      isError: false,
    })
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })

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
      createLocalTools(() => state, writeStoredTextFile),
      session,
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
    expect(fetchModel.mock.calls[0]?.[0].toString()).toContain(
      '/api/agent/providers/zai-coding-cn/chat/completions',
    )
    state.activeFile = null
    fetchModel
      .mockResolvedValueOnce(call('get_reader_state', {}))
      .mockResolvedValueOnce(reply('No active file.'))
    await agent.prompt('What about now?')
    const result = agent.state.messages.findLast(message => message.role === 'toolResult')
    expect(result).toMatchObject({ content: [{ type: 'text', text: JSON.stringify(state) }] })
    expect(agent.state.messages.filter(message => message.role === 'user')).toHaveLength(2)
    expect(createReaderAgent(config, localTools(), session).state.messages).toEqual([])
  })

  it('returns tool errors to the model without hiding a failed read', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(call('read', { fileId: 'missing' }))
      .mockResolvedValueOnce(reply('The file is unavailable.'))
    const agent = createReaderAgent(config, localTools(), session)
    await agent.prompt('Read the file')
    expect(agent.state.messages.find(message => message.role === 'toolResult')).toMatchObject({
      isError: true,
    })
    expect(fetchModel).toHaveBeenCalledTimes(2)
  })

  it('uses a one-shot vision model and returns only its text to the main agent', async () => {
    const imported = await importStoredFiles(
      [new File(['private-image-bytes'], 'screen.png', { type: 'image/png' })],
      'keep',
    )
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error('Missing image fixture')
    const close = vi.fn()
    const previous = globalThis.createImageBitmap
    globalThis.createImageBitmap = vi.fn(
      async () => ({ width: 2, height: 2, close }) as ImageBitmap,
    )
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = { url: String(url), body: JSON.parse(String(init?.body)) }
      requests.push(request)
      if (request.url.includes('/vision/')) return reply('The image shows a reading interface.')
      if (requests.filter(item => !item.url.includes('/vision/')).length === 1)
        return call('analyze_image', { fileId, question: 'What is shown?' })
      return reply('It shows a reading interface.')
    })
    try {
      const agent = createReaderAgent(config, localTools(), session)
      await agent.prompt('Describe the image')
      const vision = requests.find(request => request.url.includes('/vision/'))
      expect(vision?.body.model).toBe('glm-5.3-flash')
      expect(JSON.stringify(vision?.body)).toContain('data:image/png;base64,')
      const finalMain = requests.filter(request => !request.url.includes('/vision/')).at(-1)
      expect(JSON.stringify(finalMain?.body)).toContain('The image shows a reading interface.')
      expect(JSON.stringify(finalMain?.body)).not.toContain('cHJpdmF0ZS1pbWFnZS1ieXRlcw==')
      expect(agent.state.messages.findLast(message => message.role === 'toolResult')).toMatchObject(
        {
          content: [
            {
              type: 'text',
              text: expect.stringContaining('The image shows a reading interface.'),
            },
          ],
        },
      )
      expect(close).toHaveBeenCalled()
      expect(fetchModel).toHaveBeenCalledTimes(3)
    } finally {
      globalThis.createImageBitmap = previous
    }
  })

  it('rejects missing and non-image files before contacting the vision model', async () => {
    const imported = await importStoredFiles(
      [new File(['Readable text'], 'note.txt', { type: 'text/plain' })],
      'keep',
    )
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error('Missing text fixture')
    const requests: string[] = []
    const fetchModel = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      requests.push(String(url))
      const count = requests.filter(request => !request.includes('/vision/')).length
      if (count === 1) return call('analyze_image', { fileId: 'missing' })
      if (count === 3) return call('analyze_image', { fileId })
      return reply('That file cannot be analyzed as an image.')
    })
    const agent = createReaderAgent(config, localTools(), session)
    await agent.prompt('Analyze the missing image')
    await agent.prompt('Analyze the text file as an image')
    expect(requests.some(request => request.includes('/vision/'))).toBe(false)
    expect(
      agent.state.messages.filter(message => message.role === 'toolResult' && message.isError),
    ).toHaveLength(2)
    expect(fetchModel).toHaveBeenCalledTimes(4)
  })

  it('aborts generation and skips later queued tools', async () => {
    const local = localTools()
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
    const agent = createReaderAgent(config, local, session)
    const searchTool = agent.state.tools.find(tool => tool.name === 'search')
    if (!searchTool) throw new Error('Missing search tool')
    const search = vi.spyOn(searchTool, 'execute')
    agent.subscribe(event => {
      if (event.type === 'tool_execution_start') agent.abort()
    })
    await agent.prompt('Search the files')
    expect(search).not.toHaveBeenCalled()
    expect(fetchModel).toHaveBeenCalledTimes(1)
  })

  it('loads PDF guidance on demand and combines page text and vision within one run', async () => {
    pdfTools.destroy.mockClear()
    pdfTools.render.mockClear()
    pdfTools.read.mockClear()
    const imported = await importStoredFiles(
      [new File(['pdf'], 'Study.pdf', { type: 'application/pdf' })],
      'keep',
    )
    const fileId = imported.addedIds[0]
    if (!fileId) throw new Error('Missing PDF fixture')
    const previous = globalThis.createImageBitmap
    globalThis.createImageBitmap = vi.fn(
      async () => ({ width: 2, height: 2, close: vi.fn() }) as ImageBitmap,
    )
    const mainRequests: string[] = []
    const visionRequests: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const body = String(init?.body)
      if (String(url).includes('/vision/')) {
        visionRequests.push(body)
        return reply('A chart comparing two quantities.')
      }
      mainRequests.push(body)
      if (mainRequests.length === 1) return call('read_skill', { name: 'pdf' })
      if (mainRequests.length === 2) return call('pdf_info', { fileId })
      if (mainRequests.length === 3)
        return call('read', { fileId, range: { unit: 'page', start: 2, end: 2 } })
      if (mainRequests.length === 4)
        return call('analyze_pdf_page', { fileId, pageNumber: 2, question: 'Explain the chart.' })
      return reply('The chart compares two quantities.')
    })
    try {
      const agent = createReaderAgent(config, localTools(), session)
      await agent.prompt('Explain the second page of this PDF')
      expect(mainRequests[0]).not.toContain('# Reading PDFs')
      expect(mainRequests[1]).toContain('# Reading PDFs')
      expect(pdfTools.read).toHaveBeenCalledWith(2)
      expect(pdfTools.render).toHaveBeenCalledWith(2)
      expect(pdfTools.destroy).toHaveBeenCalledOnce()
      expect(visionRequests).toHaveLength(1)
      expect(visionRequests[0]).toContain('data:image/png;base64,')
      expect(mainRequests.at(-1)).toContain('A chart comparing two quantities.')
      expect(mainRequests.join('')).not.toContain('data:image/png;base64,')
    } finally {
      globalThis.createImageBitmap = previous
    }
  })

  it('keeps PDF text tools available without a vision model', () => {
    const agent = createReaderAgent({ ...config, visionModel: undefined }, localTools(), session)
    const names = agent.state.tools.map(tool => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['read', 'search', 'pdf_info', 'pdf_outline', 'read_skill']),
    )
    expect(names).not.toContain('analyze_pdf_page')
  })

  it('does not automatically retry provider errors and can accept a later question', async () => {
    const fetchModel = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }))
      .mockResolvedValueOnce(reply('Recovered'))
    const agent = createReaderAgent(config, localTools(), session)
    await agent.prompt('Hello')
    expect(fetchModel).toHaveBeenCalledTimes(1)
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'error' })
    await agent.prompt('Try again')
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'stop' })
  })
})
