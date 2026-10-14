import type { AssistantMessage } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyConversationDraft } from '../../../core/conversations'
import { models } from '../../../core/models/model-runtime'
import { createReaderUserMessage } from '../../../core/reader-message'
import * as conversationStore from '../../../data/conversation-store'
import { moveStoredFile, writeStoredTextFile } from '../../../data/file-store'
import { isTitleRequest, modelConfig } from '../../../test/model-config'
import { createLocalTools } from '../../assistant/local-tools'
import { createConversationController } from './controller'
import type { DraftAttachmentsPort } from './state'

const event = (delta: unknown, finish: string | null = null, tokens = 0) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }], usage: { prompt_tokens: tokens, completion_tokens: 0, total_tokens: tokens } })}\n\n`
const reply = (text: string) =>
  new Response(`${event({ content: text })}${event({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
const overflow = () =>
  Response.json({ error: { message: 'context length exceeded' } }, { status: 400 })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const assistant = (timestamp: number, tokens = 0): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: 'Earlier answer' }],
  api: 'openai-completions',
  provider: 'zai-coding-cn',
  model: 'glm-5.3',
  timestamp,
  stopReason: 'stop',
  usage: {
    input: tokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: tokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
})
const history = (tokens: number) => [
  { ...createReaderUserMessage(`old-material-${'x'.repeat(70_000)}`, []), timestamp: 1 },
  assistant(2),
  { ...createReaderUserMessage(`recent-material-${'y'.repeat(145_000)}`, []), timestamp: 3 },
  assistant(4, tokens),
]

let cleanup = () => {}
afterEach(() => cleanup())

const start = async (tokens = 0) => {
  await conversationStore.appendStoredConversationMessages({
    conversation: {
      id: 'saved',
      title: 'Reading',
      titledBy: 'reader',
      draft: emptyConversationDraft(),
      createdAt: 1,
      lastActiveAt: 1,
    },
    startPosition: 0,
    messages: history(tokens),
  })
  const attachments = {
    ready: vi.fn(() => []),
    settle: async () => {},
    replaceReady: vi.fn(),
    restore: vi.fn(),
    takeReady: vi.fn(() => []),
  } satisfies DraftAttachmentsPort
  const controller = createConversationController(
    createLocalTools(
      () => ({ openFiles: [], activeFile: null, viewport: null }),
      writeStoredTextFile,
      moveStoredFile,
    ),
    attachments,
    false,
  )
  cleanup = controller.start()
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('ready'))
  return { controller, attachments }
}

type RequestKind = 'chat' | 'summary'
const mockRequests = (
  respond: (kind: RequestKind, init?: RequestInit) => Response | Promise<Response>,
) => {
  const requests: { kind: RequestKind; body: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (url === '/api/agent/config') return Response.json(modelConfig)
    if (isTitleRequest(init)) return reply('Reading')
    const body = String(init?.body)
    const kind = body.includes('context summarization assistant') ? 'summary' : 'chat'
    requests.push({ kind, body })
    return respond(kind, init)
  })
  return requests
}

describe('conversation compaction', () => {
  it.each([0, 32_000, 127_999])(
    'does not automatically compact or recover a %i window',
    async window => {
      const getModel = models.getModel.bind(models)
      vi.spyOn(models, 'getModel').mockImplementation((provider, id) => {
        const model = getModel(provider, id)
        return model ? { ...model, contextWindow: window } : model
      })
      const requests = mockRequests(() => overflow())
      const { controller } = await start(600_000)
      controller.setDraft('Next question')
      controller.send({ unsettled: false, hasAttachments: false })
      await vi.waitFor(() => expect(controller.store.getState().phase).toBe('ready'))
      expect(requests.map(request => request.kind)).toEqual(['chat'])
      expect(controller.store.getState().messages.at(-1)).toMatchObject({ failed: true })
    },
  )

  it.each([false, true])(
    'shrinks overflow context and retries at most once (retry fails: %s)',
    async fails => {
      let chats = 0
      const requests = mockRequests(kind => {
        if (kind === 'summary') return reply('Earlier material summarized.')
        chats += 1
        return chats === 1 || fails ? overflow() : reply('Recovered answer')
      })
      const { controller } = await start()
      controller.setDraft('Keep this question exactly')
      controller.send({ unsettled: false, hasAttachments: false })
      await vi.waitFor(() => expect(controller.store.getState().phase).toBe('ready'))
      expect(requests.map(request => request.kind)).toEqual(['chat', 'summary', 'chat'])
      const first = requests[0]?.body ?? ''
      const retry = requests[2]?.body ?? ''
      expect(retry.length).toBeLessThan(first.length)
      expect(retry).not.toContain('old-material-')
      expect(retry).toContain('recent-material-')
      expect(retry).toContain('Keep this question exactly')
      expect(controller.store.getState().messages.at(-1)).toMatchObject(
        fails ? { failed: true } : { text: 'Recovered answer' },
      )
    },
  )

  it('keeps drafts and attachments when sending during manual compaction or stopping', async () => {
    const summary = deferred<Response>()
    const requests = mockRequests(() => summary.promise)
    const { controller, attachments } = await start()
    const compacting = controller.compact()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    controller.setDraft('Still editing')
    controller.attachmentsChanged([
      { id: 'note', name: 'note.md', mediaType: 'text/markdown', previewKind: 'markdown', size: 5 },
    ])
    const before = controller.store.getState().active
    controller.send({ unsettled: false, hasAttachments: true })
    expect(controller.store.getState().active).toBe(before)
    controller.stop()
    expect(controller.store.getState().phase).toBe('stopping')
    controller.send({ unsettled: false, hasAttachments: true })
    expect(controller.store.getState().active).toBe(before)
    expect(attachments.takeReady).not.toHaveBeenCalled()
    summary.resolve(reply('A summary arriving after cancellation'))
    await compacting
    expect(controller.store.getState().draft).toBe('Still editing')
    expect(
      controller.store.getState().messages.some(message => message.role === 'compaction'),
    ).toBe(false)
    expect(requests.map(request => request.kind)).toEqual(['summary'])
    expect(controller.store.getState().phase).toBe('ready')
  })

  it.each(['before sending', 'overflow recovery'])(
    'does not resume when stopped while saving a summary (%s)',
    async trigger => {
      const requests = mockRequests(kind =>
        kind === 'summary' ? reply('Summary saved') : overflow(),
      )
      const { controller } = await start(trigger === 'before sending' ? 600_000 : 0)
      const saved = deferred<void>()
      const release = deferred<void>()
      const append = conversationStore.appendStoredConversationMessages
      vi.spyOn(conversationStore, 'appendStoredConversationMessages').mockImplementation(
        async input => {
          await append(input)
          if (!input.messages.some(message => message.role === 'compaction')) return
          saved.resolve()
          await release.promise
        },
      )
      controller.setDraft('Unsent question')
      controller.send({ unsettled: false, hasAttachments: false })
      await saved.promise
      controller.stop()
      release.resolve()
      await vi.waitFor(() => expect(controller.store.getState().phase).toBe('ready'))
      expect(requests.map(request => request.kind)).toEqual(
        trigger === 'before sending' ? ['summary'] : ['chat', 'summary'],
      )
      expect(controller.store.getState().draft).toBe(
        trigger === 'before sending' ? 'Unsent question' : '',
      )
      const stored = await conversationStore.getStoredConversation('saved')
      expect(stored?.messages.some(message => message.role === 'compaction')).toBe(true)
    },
  )

  it.each(['finish', 'stop', 'switch'])(
    'handles %s during between-turn compaction without accepting new messages',
    async action => {
      const first = deferred<Response>()
      const summary = deferred<Response>()
      let chats = 0
      const requests = mockRequests(kind => {
        if (kind === 'summary') return summary.promise
        chats += 1
        return chats === 1 ? first.promise : reply('Finished')
      })
      const { controller } = await start()
      controller.setDraft('Read more')
      controller.send({ unsettled: false, hasAttachments: false })
      await vi.waitFor(() => expect(requests).toHaveLength(1))
      controller.setDraft('Queued before compaction')
      controller.send({ unsettled: false, hasAttachments: false })
      first.resolve(
        new Response(
          `${event({ tool_calls: [{ index: 0, id: 'state', type: 'function', function: { name: 'get_reader_state', arguments: '{}' } }] }, 'tool_calls', 600_000)}data: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
      await vi.waitFor(() => expect(controller.store.getState().phase).toBe('compacting'))
      controller.setDraft('Draft during compaction')
      controller.send({ unsettled: false, hasAttachments: false })
      const phases: string[] = []
      const unsubscribe = controller.store.subscribe(state => phases.push(state.phase))
      if (action === 'stop') controller.stop()
      const switching = action === 'switch' ? controller.startNew() : undefined
      summary.resolve(reply('Earlier material summarized'))
      await switching
      await vi.waitFor(() => expect(controller.store.getState().phase).toBe('ready'))
      unsubscribe()
      expect(requests.map(request => request.kind)).toEqual(
        action === 'finish' ? ['chat', 'summary', 'chat'] : ['chat', 'summary'],
      )
      if (action === 'finish') {
        expect(requests[2]?.body).toContain('Queued before compaction')
        expect(requests[2]?.body).not.toContain('Draft during compaction')
      } else expect(phases).not.toContain('running')
      if (action === 'switch') {
        expect(controller.store.getState().active.id).not.toBe('saved')
        expect(
          (await conversationStore.getStoredConversation('saved'))?.conversation.draft.text,
        ).toBe('Draft during compaction')
      } else expect(controller.store.getState().draft).toBe('Draft during compaction')
    },
  )
})
