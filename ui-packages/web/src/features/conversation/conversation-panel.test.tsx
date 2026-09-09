import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Workbench } from '../../shell/workbench'

const event = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'answer', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const config = { enabled: true, provider: 'zai-coding-cn', modelId: 'glm-5.3' }
const open = () =>
  render(
    <MemoryRouter>
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
    await screen.findByRole('tab', { name: 'Getting started.md' })
    await user.type(question(), 'Explain this')
    await waitFor(() => expect(send()).toBeEnabled())
    fireEvent.keyDown(question(), { key: 'Enter', isComposing: true })
    expect(requests).toHaveLength(0)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(question()).toHaveValue('Explain this\n')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(requests).toHaveLength(1))
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
    await user.type(question(), 'What am I reading?')
    await waitFor(() => expect(send()).toBeEnabled())
    await user.click(send())
    await waitFor(() => expect(calls).toBe(2))
    const activity = screen.getByRole('list', { name: 'Tool activity' })
    expect(within(activity).getByText('get_reader_state')).toBeVisible()
    expect(within(activity).getByText('Completed')).toBeVisible()
    expect(screen.queryByText('openFiles')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop generation' }))
    await screen.findByText('Generation stopped.')
    expect(signal?.aborted).toBe(true)
    await user.type(question(), 'Continue')
    await user.click(send())
    expect(await screen.findByText('Ready again')).toBeVisible()
  })

  it('shows initialization failure without discarding a draft', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}, { status: 503 }))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect to chat')
    await userEvent.type(question(), 'Keep this question')
    expect(send()).toBeDisabled()
    expect(question()).toHaveValue('Keep this question')
  })
})
