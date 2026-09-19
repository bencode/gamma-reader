import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationAttachment } from '../../core/agent/reader-message'
import { Workbench } from '../../shell/workbench'
import { DraftAttachmentTray, MessageAttachments } from './conversation-attachments'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'answer', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const config = {
  enabled: true,
  provider: 'zai-coding-cn',
  models: [
    { id: 'glm-5.3', label: 'GLM-5.3', efforts: ['low', 'high', 'max'], defaultEffort: 'low' },
    { id: 'glm-5.2', label: 'GLM-5.2', efforts: ['off', 'high', 'max'], defaultEffort: 'high' },
  ],
  modelId: 'glm-5.3',
}
const open = () =>
  render(
    <MemoryRouter initialEntries={['/files/getting-started']}>
      <Workbench />
    </MemoryRouter>,
  )
const send = () => screen.getByRole('button', { name: 'Send question' })
const question = () => screen.getByRole('textbox', { name: 'Your question' })
const complete = (text: string) =>
  new Response(`${event({ content: text }) + event({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })

describe('conversation', () => {
  it('applies model-specific effort to requests and restores it with the conversation', async () => {
    const user = userEvent.setup()
    const requests: Record<string, unknown>[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
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

    await user.selectOptions(model, 'glm-5.2')
    expect(effort).toHaveValue('max')
    await user.selectOptions(effort, 'off')
    await user.type(question(), 'Answer directly')
    await user.click(send())
    await waitFor(() => expect(model).toBeEnabled())
    expect(requests[1]).toMatchObject({ model: 'glm-5.2', thinking: { type: 'disabled' } })
    expect(requests[1]).not.toHaveProperty('reasoning_effort')
    page.unmount()

    open()
    const restored = await screen.findByRole('combobox', { name: 'Chat model' })
    expect(restored).toHaveValue('glm-5.2')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('off')
    await user.selectOptions(restored, 'glm-5.3')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('low')
    await user.selectOptions(restored, 'glm-5.2')
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('high')
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    await waitFor(() => expect(restored).toHaveValue('glm-5.3'))
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveValue('low')
  })

  it('previews unsent images and keeps image navigation inside the attachment group', async () => {
    const user = userEvent.setup()
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
    const user = userEvent.setup()
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
    const user = userEvent.setup()
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const requests: RequestInit[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
      if (init) requests.push(init)
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
    expect(question()).toHaveValue('Next question')
    expect(screen.getByText('First words')).toBeVisible()
    await act(async () => {
      controller?.enqueue(
        new TextEncoder().encode(
          `${event({ content: ' complete.' }) + event({}, 'stop')}data: [DONE]\n\n`,
        ),
      )
      controller?.close()
    })
    await waitFor(() => expect(send()).toBeEnabled())
    expect(screen.getByText('First words').tagName).toBe('STRONG')
  })

  it('shows tool activity without raw results and allows another question after stopping', async () => {
    const user = userEvent.setup()
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

  it('switches between isolated conversations and restores the active transcript', async () => {
    const user = userEvent.setup()
    const requests: Array<{ messages: Array<{ role: string; content: unknown }> }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/agent/config') return Response.json(config)
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

  it('shows initialization failure without discarding a draft', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 503 }))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to chat')
    await userEvent.type(question(), 'Keep this question')
    expect(send()).toBeDisabled()
    expect(question()).toHaveValue('Keep this question')
  })

  it('stores attached files in the workspace and sends only stable attachment metadata', async () => {
    const user = userEvent.setup()
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
    expect(sent?.content[1]?.text).toContain('"name":"Chat notes.md"')
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
