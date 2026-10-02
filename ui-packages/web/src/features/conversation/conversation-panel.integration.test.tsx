import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationAttachment } from '../../core/agent/reader-message'
import { emptyConversationDraft } from '../../core/conversations'
import {
  countStoredConversations,
  getStoredConversation,
  saveStoredConversationDraft,
} from '../../data/conversation-store'
import { Workbench } from '../../shell/workbench'
import { modelConfig as config, isTitleRequest } from '../../test/model-config'
import { testProject } from '../../test/project'
import { DraftAttachmentTray, MessageAttachments } from './conversation-attachments'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'answer', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const open = () =>
  render(
    <MemoryRouter initialEntries={['/files/getting-started']}>
      <Workbench project={testProject} />
    </MemoryRouter>,
  )
const send = () => screen.getByRole('button', { name: 'Send question' })
const activeConversationId = () => localStorage.getItem('gamma-reader.active-conversation') ?? ''
const question = () => screen.getByRole('textbox', { name: 'Your question' })
const complete = (text: string) =>
  new Response(`${event({ content: text }) + event({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })

describe('conversation', () => {
  it('shows the sentence a refused request carries instead of its status body', async () => {
    const user = userEvent.setup({ delay: null })
    const limit = 'The daily chat limit for this network is used up. It resets at 00:00 UTC.'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
      url === '/api/agent/config'
        ? Response.json(config)
        : Response.json({ error: { message: limit } }, { status: 429 }),
    )
    open()
    await screen.findByRole('combobox', { name: 'Chat model' })
    await user.type(question(), 'Anything at all')
    await user.click(send())

    expect(await screen.findByText(limit)).toBeInTheDocument()
  })

  it('persists the initial model so changing deployment defaults does not change an existing chat', async () => {
    const user = userEvent.setup({ delay: null })
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async url =>
        url === '/api/agent/config' ? Response.json(config) : complete('A reply'),
      )
    const page = open()
    await screen.findByRole('combobox', { name: 'Chat model' })
    await user.type(question(), 'Keep the original model')
    await user.click(send())
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Chat model' })).toBeEnabled())
    page.unmount()
    network.mockResolvedValue(
      Response.json({
        ...config,
        defaultModel: { provider: 'deepseek', modelId: 'deepseek-flash' },
      }),
    )
    open()
    expect(await screen.findByRole('combobox', { name: 'Chat model' })).toHaveDisplayValue(
      'GLM-5.3',
    )
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Chat model' })).toHaveDisplayValue(
        'DeepSeek V4.1 Flash',
      ),
    )
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('off')
  })

  it('uses native DeepSeek options, routes the selected model and restores its provider', async () => {
    const user = userEvent.setup({ delay: null })
    const requests: { url: string; body: Record<string, unknown> }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return Response.json({}, { status: 503 })
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return complete('A reply')
    })
    const page = open()
    const model = await screen.findByRole('combobox', { name: 'Chat model' })
    expect(within(model).getByRole('group', { name: 'DeepSeek' })).toBeInTheDocument()
    await user.selectOptions(model, 'DeepSeek V4.1 Flash')
    const effort = screen.getByRole('combobox', { name: 'Reasoning effort' })
    expect(
      within(effort)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['off', 'low', 'high', 'max'])
    expect(effort).toHaveValue('low')
    await user.selectOptions(effort, 'off')
    await user.type(question(), 'Answer directly')
    await user.click(send())
    await waitFor(() => expect(model).toBeEnabled())
    expect(requests[0]?.url).toContain('/api/agent/providers/deepseek/chat/completions')
    expect(requests[0]?.body).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
    })
    expect(requests[0]?.body).not.toHaveProperty('reasoning_effort')
    page.unmount()

    open()
    const restored = await screen.findByRole('combobox', { name: 'Chat model' })
    expect(restored).toHaveDisplayValue('DeepSeek V4.1 Flash')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('off')
    await user.selectOptions(restored, 'DeepSeek V4 Pro')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Reasoning effort' }), 'max')
    await user.type(question(), 'Explain further')
    await user.click(send())
    await waitFor(() => expect(restored).toBeEnabled())
    expect(requests[1]?.body).toMatchObject({
      model: 'deepseek-v4-pro',
      reasoning_effort: 'max',
      thinking: { type: 'enabled' },
    })
    expect(JSON.stringify(requests[1]?.body.messages)).toContain('Answer directly')
  })

  it.each([
    {
      selection: { provider: 'zai-coding-cn', modelId: 'glm-5.3', effort: 'max' as const },
      model: 'GLM-5.3',
      effort: 'max',
    },
    {
      selection: { provider: 'removed', modelId: 'missing', effort: 'off' as const },
      model: 'GLM-5.3',
      effort: 'low',
    },
  ])(
    'restores saved or unavailable model selections: $model',
    async ({ selection, model, effort }) => {
      await saveStoredConversationDraft({
        id: 'saved-selection',
        title: 'Saved chat',
        selection,
        draft: emptyConversationDraft(),
        createdAt: 1,
        lastActiveAt: 1,
      })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(config))
      open()
      expect(await screen.findByRole('combobox', { name: 'Chat model' })).toHaveDisplayValue(model)
      expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue(effort)
      await userEvent.type(question(), 'Keep this selection')
      await waitFor(async () => {
        expect(
          (await getStoredConversation('saved-selection'))?.conversation.selection,
        ).toMatchObject({ provider: 'zai-coding-cn', effort })
      })
    },
  )

  it('shows the context size and the tokens a conversation used, and restores them', async () => {
    const user = userEvent.setup({ delay: null })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return Response.json({}, { status: 503 })
      const usage = { prompt_tokens: 41_000, completion_tokens: 1_200, total_tokens: 42_200 }
      return new Response(
        `${event({ content: 'A reply' })}${`data: ${JSON.stringify({ id: 'answer', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}\n\n`}data: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const page = open()
    await screen.findByRole('combobox', { name: 'Chat model' })
    expect(screen.queryByText(/used$/)).not.toBeInTheDocument()
    await user.type(question(), 'Summarize this')
    await user.click(send())

    expect(await screen.findByText('42.2K / 1M · 42.2K used')).toBeInTheDocument()
    page.unmount()
    open()
    expect(await screen.findByText('42.2K / 1M · 42.2K used')).toBeInTheDocument()
  })

  it('shows SDK configuration errors while keeping saved conversation history', async () => {
    await saveStoredConversationDraft({
      id: 'existing',
      title: 'Existing chat',
      draft: emptyConversationDraft(),
      createdAt: 1,
      lastActiveAt: 1,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        ...config,
        providers: [{ id: 'deepseek', chatModels: ['unknown-model'] }],
      }),
    )
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unsupported pi model: deepseek/unknown-model',
    )
    expect((await getStoredConversation('existing'))?.conversation.title).toBe('Existing chat')
    expect(send()).toBeDisabled()
  })

  it('applies model-specific effort to requests and restores it with the conversation', async () => {
    const user = userEvent.setup({ delay: null })
    const requests: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return Response.json({}, { status: 503 })
      requests.push(JSON.parse(String(init?.body)))
      return complete('A reply')
    })
    const page = open()
    const model = await screen.findByRole('combobox', { name: 'Chat model' })
    const effort = screen.getByRole('combobox', { name: 'Reasoning effort' })
    expect(
      within(effort)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['low', 'high', 'max'])
    await user.selectOptions(effort, 'max')
    await user.type(question(), 'Think carefully')
    await user.click(send())
    await waitFor(() => expect(model).toBeEnabled())
    expect(requests[0]).toMatchObject({
      model: 'glm-5.3',
      reasoning_effort: 'max',
      thinking: { type: 'enabled' },
    })

    await user.selectOptions(model, 'DeepSeek V4.1 Flash')
    expect(effort).toHaveValue('max')
    await user.selectOptions(effort, 'off')
    await user.type(question(), 'Answer directly')
    await user.click(send())
    await waitFor(() => expect(model).toBeEnabled())
    expect(requests[1]).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
    })
    expect(requests[1]).not.toHaveProperty('reasoning_effort')
    page.unmount()

    open()
    const restored = await screen.findByRole('combobox', { name: 'Chat model' })
    expect(restored).toHaveDisplayValue('DeepSeek V4.1 Flash')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('off')
    await user.selectOptions(restored, 'GLM-5.3')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('low')
    await user.selectOptions(restored, 'DeepSeek V4.1 Flash')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('low')
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() => expect(restored).toHaveDisplayValue('GLM-5.3'))
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('low')
  })

  it('previews unsent images and keeps image navigation inside the attachment group', async () => {
    const user = userEvent.setup({ delay: null })
    const onOpen = vi.fn()
    render(
      <DraftAttachmentTray
        attachments={[
          {
            key: 'first-image',
            file: new File(['first'], 'First.png', { type: 'image/png' }),
            status: 'adding',
          },
          {
            key: 'second-image',
            file: new File(['second'], 'Second.png', { type: 'image/png' }),
            status: 'adding',
          },
        ]}
        onOpen={onOpen}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        availableFileIds={new Set()}
      />,
    )

    await user.click(screen.getByTitle('Preview First.png'))
    let dialog = await screen.findByRole('dialog', { name: 'Preview First.png' })
    expect(screen.queryByRole('button', { name: 'Open in reader' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next image' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Next image' }))
    dialog = await screen.findByRole('dialog', { name: 'Preview Second.png' })
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next image' })).toBeDisabled()

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('offers the reader action when a sent image has a stable file id', async () => {
    const user = userEvent.setup({ delay: null })
    const onOpen = vi.fn()
    const attachment: ConversationAttachment = {
      id: 'stored-image',
      name: 'Sent.png',
      mediaType: 'image/png',
      previewKind: 'image',
      size: 4,
    }
    render(
      <MessageAttachments
        attachments={[attachment]}
        onOpen={onOpen}
        availableFileIds={new Set([attachment.id])}
      />,
    )

    await user.click(screen.getByTitle('Preview Sent.png'))
    expect(await screen.findByRole('dialog', { name: 'Preview Sent.png' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Previous image' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open in reader' }))

    expect(onOpen).toHaveBeenCalledWith(attachment.id)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('streams Markdown, preserves messages when panels remount, and sends only the question', async () => {
    const user = userEvent.setup({ delay: null })
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const requests: RequestInit[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (init && !isTitleRequest(init)) requests.push(init)
      return new Response(
        new ReadableStream({
          start(value) {
            controller = value
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    open()
    await screen.findByRole('tab', { name: 'Start here.md' })
    await user.type(question(), 'Explain this')
    await waitFor(() => expect(send()).toBeEnabled())
    fireEvent.keyDown(question(), { key: 'Enter', isComposing: true })
    expect(requests).toHaveLength(0)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(question()).toHaveValue('Explain this\n')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(screen.getByRole('combobox', { name: 'Chat model' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toBeDisabled()
    expect(
      JSON.parse(String(requests[0]?.body)).messages.filter(
        (message: { role: string }) => message.role !== 'system',
      ),
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Explain this' }] }])
    await act(async () =>
      controller?.enqueue(new TextEncoder().encode(event({ content: '**First words**' }))),
    )
    expect(await screen.findByText('First words')).toBeVisible()
    await user.type(question(), 'Next question')
    await user.keyboard('{Enter}')
    expect(requests).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Close reading assistant' }))
    await user.click(screen.getByRole('button', { name: 'Open reading assistant' }))
    const queue = screen.getByRole('list', { name: 'Queued messages' })
    expect(within(queue).getByText('Next question')).toBeVisible()
    expect(screen.getByText('First words')).toBeVisible()
    await user.click(within(queue).getByRole('button', { name: 'Remove queued message' }))
    await act(async () => {
      controller?.enqueue(
        new TextEncoder().encode(
          `${event({ content: ' complete.' }) + event({}, 'stop')}data: [DONE]\n\n`,
        ),
      )
      controller?.close()
    })
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Chat model' })).toBeEnabled())
    expect(requests).toHaveLength(1)
    expect(screen.getByText('First words').tagName).toBe('STRONG')
  })

  it('shows tool activity without raw results and allows another question after stopping', async () => {
    const user = userEvent.setup({ delay: null })
    let signal: AbortSignal | null | undefined
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      calls += 1
      if (calls === 1)
        return new Response(
          `${event(
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'state-call',
                  type: 'function',
                  function: { name: 'get_reader_state', arguments: '{}' },
                },
              ],
            },
            'tool_calls',
          )}data: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        )
      if (calls > 2) return complete('Ready again')
      signal = init?.signal
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    open()
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'What am I reading?')
    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    await waitFor(() => expect(calls).toBe(2))
    const activity = screen.getByRole('list', { name: 'Tool activity' })
    expect(within(activity).getByText('Checking reading context')).toBeVisible()
    expect(within(activity).getByText('Completed')).toBeVisible()
    expect(screen.queryByText('openFiles')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop generation' }))
    await screen.findByText('Generation stopped.')
    expect(signal?.aborted).toBe(true)
    await user.type(question(), 'Continue')
    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    expect(await screen.findByText('Ready again')).toBeVisible()
  })

  it('queues a message during a reply and gives it to the model at the next turn', async () => {
    const user = userEvent.setup({ delay: null })
    const bodies: { messages: { role: string; content: unknown }[] }[] = []
    let releaseToolCall = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return complete('Title')
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length > 1) return complete('Checked both')
      return new Response(
        new ReadableStream({
          start(controller) {
            releaseToolCall = () => {
              controller.enqueue(
                new TextEncoder().encode(
                  `${event(
                    {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'state-call',
                          type: 'function',
                          function: { name: 'get_reader_state', arguments: '{}' },
                        },
                      ],
                    },
                    'tool_calls',
                  )}data: [DONE]\n\n`,
                ),
              )
              controller.close()
            }
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    open()
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'What am I reading?')
    await user.click(send())
    await waitFor(() => expect(bodies).toHaveLength(1))
    await user.type(question(), 'Also list the open files{Enter}')

    const queue = screen.getByRole('list', { name: 'Queued messages' })
    expect(within(queue).getByText('Also list the open files')).toBeVisible()
    expect(question()).toHaveValue('')
    act(() => releaseToolCall())

    expect(await screen.findByText('Checked both')).toBeVisible()
    const sent = bodies[1]?.messages ?? []
    expect(sent.at(-2)?.role).toBe('tool')
    expect(sent.at(-1)?.role).toBe('user')
    expect(JSON.stringify(sent.at(-1)?.content)).toContain('Also list the open files')
    expect(screen.queryByRole('list', { name: 'Queued messages' })).not.toBeInTheDocument()
  })

  it('sends queued messages as soon as Escape stops the reply', async () => {
    const user = userEvent.setup({ delay: null })
    const bodies: { messages: { role: string; content: unknown }[] }[] = []
    let signal: AbortSignal | null | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return complete('Title')
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length > 1) return complete('Answered the follow-up')
      signal = init?.signal
      return new Response(
        new ReadableStream({
          start(controller) {
            signal?.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    open()
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'Summarize everything')
    await user.click(send())
    await waitFor(() => expect(bodies).toHaveLength(1))
    await user.type(question(), 'Only the first chapter{Enter}')
    await user.keyboard('{Escape}')

    expect(await screen.findByText('Generation stopped.')).toBeVisible()
    expect(signal?.aborted).toBe(true)
    expect(await screen.findByText('Answered the follow-up')).toBeVisible()
    expect(screen.queryByRole('list', { name: 'Queued messages' })).not.toBeInTheDocument()
    expect(JSON.stringify(bodies[1]?.messages.at(-1)?.content)).toContain('Only the first chapter')
  })

  it('switches between isolated conversations and restores the active transcript', async () => {
    const user = userEvent.setup({ delay: null })
    const requests: Array<{ messages: Array<{ role: string; content: unknown }> }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return Response.json({}, { status: 503 })
      requests.push(JSON.parse(String(init?.body)))
      return complete(requests.length === 1 ? 'First answer' : 'Second answer')
    })
    const page = open()
    await waitFor(() => expect(question()).toBeEnabled())

    await user.type(question(), 'First topic')
    await user.click(send())
    expect(await screen.findByText('First answer')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() => {
      expect(screen.queryByText('First answer')).not.toBeInTheDocument()
      expect(question()).toBeEnabled()
      expect(question()).toHaveValue('')
    })
    await user.type(question(), 'Second topic')
    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    expect(await screen.findByText('Second answer')).toBeVisible()

    expect(
      requests[1]?.messages
        .filter(message => message.role !== 'system')
        .map(message => message.role),
    ).toEqual(['user'])
    await user.click(screen.getByRole('button', { name: 'Conversation history' }))
    const history = screen.getByRole('region', { name: 'Conversation history' })
    expect(within(history).getByText('First topic')).toBeVisible()
    expect(within(history).getByText('Second topic')).toBeVisible()
    await user.click(within(history).getByText('First topic'))
    await waitFor(() => expect(screen.getByText('First answer')).toBeVisible())
    expect(screen.queryByText('Second answer')).not.toBeInTheDocument()

    page.unmount()
    open()
    expect(await screen.findByText('First answer')).toBeVisible()
    expect(question()).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Conversation history' }))
    const restoredHistory = screen.getByRole('region', { name: 'Conversation history' })
    const activeRow = within(restoredHistory).getByText('First topic').closest('li')
    if (!activeRow) throw new Error('Active history row is missing')
    await user.click(
      within(activeRow).getByRole('button', { name: 'More actions for First topic' }),
    )
    await user.click(within(activeRow).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Second answer')).toBeVisible()
  })

  it('starts a new conversation from /clear without saving the command anywhere', async () => {
    const user = userEvent.setup({ delay: null })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (isTitleRequest(init)) return Response.json({}, { status: 503 })
      return complete('First answer')
    })
    open()
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'First topic')
    await user.click(send())
    expect(await screen.findByText('First answer')).toBeVisible()
    const previous = activeConversationId()

    await user.type(question(), '/cl')
    const menu = screen.getByRole('listbox', { name: 'Commands' })
    expect(within(menu).getByRole('option', { name: /clear/ })).toBeVisible()
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.queryByText('First answer')).not.toBeInTheDocument()
      expect(question()).toHaveValue('')
    })
    expect((await getStoredConversation(previous))?.conversation.draft).toEqual(
      emptyConversationDraft(),
    )
    expect(await countStoredConversations()).toBe(1)
  })

  it('names a conversation after its first reply and keeps a name the reader chose', async () => {
    const user = userEvent.setup({ delay: null })
    let titleRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (!isTitleRequest(init)) return complete('Wrens sing first, then robins.')
      titleRequests += 1
      return complete('"Birdsong at dawn"')
    })
    open()
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'summarize this')
    await user.click(send())
    const heading = () =>
      within(screen.getByRole('complementary', { name: 'Reading assistant' })).getByRole(
        'heading',
        { level: 2 },
      )
    await waitFor(() => expect(heading()).toHaveTextContent('Birdsong at dawn'))

    await user.click(screen.getByRole('button', { name: 'Conversation history' }))
    const history = screen.getByRole('region', { name: 'Conversation history' })
    await user.click(
      within(history).getByRole('button', { name: 'More actions for Birdsong at dawn' }),
    )
    await user.click(within(history).getByRole('button', { name: 'Rename' }))
    const field = within(history).getByRole('textbox', { name: 'Conversation name' })
    await user.clear(field)
    await user.type(field, 'Morning chorus{Enter}')
    expect(await within(history).findByText('Morning chorus')).toBeVisible()

    await user.click(within(history).getByText('Morning chorus'))
    await waitFor(() => expect(question()).toBeEnabled())
    await user.type(question(), 'And the robins?')
    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    await waitFor(() =>
      expect(screen.getAllByText('Wrens sing first, then robins.')).toHaveLength(2),
    )
    expect(heading()).toHaveTextContent('Morning chorus')
    expect(titleRequests).toBe(1)
    expect(await getStoredConversation(activeConversationId())).toMatchObject({
      conversation: { title: 'Morning chorus', titledBy: 'reader' },
    })
  })

  it('shows initialization failure without discarding a draft', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 503 }))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to chat')
    await userEvent.type(question(), 'Keep this question')
    expect(send()).toBeDisabled()
    expect(question()).toHaveValue('Keep this question')
  })

  it('stores attached files in the workspace and sends only stable attachment metadata', async () => {
    const user = userEvent.setup({ delay: null })
    const requests: RequestInit[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (init) requests.push(init)
      return complete('I read the attachment.')
    })
    open()
    await screen.findByRole('tab', { name: 'Start here.md' })
    await waitFor(() => expect(question()).toBeEnabled())

    const attachment = new File(['private attachment content'], 'Chat notes.md', {
      type: 'text/markdown',
    })
    await user.upload(screen.getByLabelText('Choose chat attachments'), attachment)
    const tray = await screen.findByRole('list', { name: 'Attachments to send' })
    await waitFor(() => expect(within(tray).getByText('Chat notes.md')).toBeVisible())
    const workspaceAttachments = await screen.findByRole('list', { name: 'Attachments' })
    expect(within(workspaceAttachments).getByText('Chat notes.md')).toBeVisible()

    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    await screen.findByText('I read the attachment.')

    const body = JSON.parse(String(requests[0]?.body)) as {
      messages: Array<{ role: string; content: Array<{ type: string; text: string }> }>
    }
    const sent = body.messages.find(message => message.role === 'user')
    expect(sent?.content[0]?.text).toBe('Review the attached workspace files.')
    expect(sent?.content[1]?.text).toContain('"path":"Chat notes.md"')
    expect(sent?.content[1]?.text).toContain('"fileId":')
    expect(String(requests[0]?.body)).not.toContain('private attachment content')

    await user.click(
      within(screen.getByRole('list', { name: 'Message attachments' })).getByRole('button'),
    )
    expect(await screen.findByRole('tab', { name: 'Chat notes.md' })).toBeVisible()

    await user.click(
      within(workspaceAttachments).getByRole('button', {
        name: 'Remove Chat notes.md from Attachments',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const sentAttachment = within(
      screen.getByRole('list', { name: 'Message attachments' }),
    ).getByRole('button')
    await waitFor(() => expect(sentAttachment).toBeDisabled())
    expect(sentAttachment).toHaveTextContent('Unavailable')
  })
})
