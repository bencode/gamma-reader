import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { usePanelWidths } from './use-panel-widths'
import { Workbench } from './workbench'

const material = (name: string) =>
  within(screen.getByRole('list', { name: 'Files' })).getByRole('button', { name })
const waitForWorkspace = () => screen.findByRole('tab', { name: 'Getting started.md' })
const streamEvent = (delta: unknown, finish: string | null = null) =>
  `data: ${JSON.stringify({ id: 'reply', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const reply = (text: string) =>
  new Response(`${streamEvent({ content: text }) + streamEvent({}, 'stop')}data: [DONE]\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
const writeCall = (path: string, content: string) =>
  new Response(
    `${streamEvent(
      {
        tool_calls: [
          {
            index: 0,
            id: 'write-file',
            type: 'function',
            function: { name: 'write', arguments: JSON.stringify({ path, content }) },
          },
        ],
      },
      'tool_calls',
    )}data: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  )

describe('reading workspace', () => {
  it('shows an agent-written file without changing the active document', async () => {
    const user = userEvent.setup()
    let modelRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url === '/api/agent/config')
        return Response.json({ enabled: true, provider: 'zai-coding-cn', modelId: 'glm-5.3' })
      if (url.endsWith('/api/agent/chat/completions')) {
        modelRequests += 1
        if (modelRequests === 1)
          return writeCall('Saved notes.md', '# Saved\n\nA durable conclusion.')
        if (modelRequests === 3)
          return writeCall('saved NOTES.md', '# Revised\n\nThe updated conclusion.')
        return reply(modelRequests === 2 ? 'Saved the notes.' : 'Revised the notes.')
      }
      throw new Error(`Unexpected network request: ${url}`)
    })
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    const input = screen.getByRole('textbox', { name: 'Your question' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'Save our conclusion as a new file')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(
      await screen.findByRole('button', { name: 'Saved notes.md' }, { timeout: 3000 }),
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Getting started.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('tab', { name: 'Saved notes.md' })).not.toBeInTheDocument()

    await user.click(material('Saved notes.md'))
    expect(await screen.findByRole('tab', { name: 'Saved notes.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(await screen.findByRole('heading', { name: 'Saved' })).toBeVisible()

    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'Replace that file with the revised conclusion')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByRole('heading', { name: 'Revised' })).toBeVisible()
    expect(screen.getAllByRole('tab', { name: 'saved NOTES.md' })).toHaveLength(1)
  })

  it('opens unique tabs, chooses the right neighbor on close, and reopens from empty', async () => {
    const user = userEvent.setup()
    const network = vi.spyOn(globalThis, 'fetch')
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    await user.click(material('How Gamma Reader works.svg'))
    await user.click(material('Reading notes.md'))
    await user.click(material('How Gamma Reader works.svg'))
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Close How Gamma Reader works.svg' }))
    expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Close Getting started.md' }))
    expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Close Reading notes.md' }))
    await user.click(screen.getByRole('button', { name: 'Open Getting started.md' }))
    expect(await screen.findByRole('heading', { name: 'Welcome to Gamma Reader' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save to folder' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Your files' })).not.toBeInTheDocument()
    expect(screen.queryByText('EXAMPLE DOCUMENT')).not.toBeInTheDocument()
    expect(screen.queryByText('Follow your curiosity.')).not.toBeInTheDocument()
    expect(screen.queryByText('Draft a question')).not.toBeInTheDocument()
    expect(network.mock.calls.every(([url]) => url === '/api/agent/config')).toBe(true)
  })

  it('keeps each tab scroll position and supports keyboard tab switching', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    await screen.findByRole('heading', { name: 'Welcome to Gamma Reader' })
    const pane = screen.getByRole('tabpanel')
    const scroll = pane.querySelector('.document-scroll')
    if (!scroll) throw new Error('Document scroll container is missing')
    fireEvent.scroll(scroll, { target: { scrollTop: 260 } })
    await user.click(material('Reading notes.md'))
    await user.click(screen.getByRole('tab', { name: 'Getting started.md' }))
    expect(scroll.scrollTop).toBe(260)
    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
  })

  it('keeps keyboard navigation in the reader after closing tabs', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    await user.click(material('How Gamma Reader works.svg'))
    await user.click(material('Reading notes.md'))
    await user.click(screen.getByRole('tab', { name: 'How Gamma Reader works.svg' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close How Gamma Reader works.svg' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Getting started.md' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Getting started.md' })).toHaveFocus()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Open Getting started.md' })).toHaveFocus()
  })

  it('preserves a question across document and panel changes', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'What does this mean?')
    await user.click(material('Reading notes.md'))
    await user.click(screen.getByRole('button', { name: 'Close Getting started.md' }))
    await user.click(screen.getByRole('button', { name: 'Close reading assistant' }))
    await user.click(screen.getByRole('button', { name: 'Hide files' }))
    await user.click(screen.getByRole('button', { name: 'Open reading assistant' }))
    expect(screen.getByRole('textbox')).toHaveValue('What does this mean?')
  })

  it('keeps drafts when resizing into an overlay and restores focus when it closes', async () => {
    let wide = true
    const listeners = new Set<() => void>()
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.add(listener as () => void)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.delete(listener as () => void)
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    await user.type(screen.getByRole('textbox'), 'Explain the main idea in simpler terms.')
    act(() => {
      wide = false
      listeners.forEach(notify => {
        notify()
      })
    })
    const trigger = screen.getByRole('button', { name: 'Open reading assistant' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Reading assistant panel' })).toBeVisible()
    expect(screen.getByRole('textbox')).toHaveValue('Explain the main idea in simpler terms.')
    await user.click(screen.getByRole('button', { name: 'Close reading assistant' }))
    expect(trigger).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Open files' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(material('Reading notes.md'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

describe('panel width preferences', () => {
  const storageKey = 'gamma-reader.panel-widths'

  it('restores widths and retains hidden panel preferences when another panel changes', () => {
    const first = renderHook(usePanelWidths)
    expect(first.result.current.widths).toEqual({ files: 240, assistant: 360 })
    act(() => first.result.current.saveWidths({ files: 420, assistant: 480 }))
    first.unmount()
    const reopened = renderHook(usePanelWidths)
    expect(reopened.result.current.widths).toEqual({ files: 420, assistant: 480 })
    act(() => reopened.result.current.saveWidths({ assistant: 520 }))
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual({
      files: 420,
      assistant: 520,
    })
  })

  it.each(['{', '{"files":-10,"assistant":360}'])(
    'uses defaults and reports an invalid saved value: %s',
    stored => {
      localStorage.setItem(storageKey, stored)
      const report = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = renderHook(usePanelWidths)
      expect(result.current.widths).toEqual({ files: 240, assistant: 360 })
      expect(report).toHaveBeenCalledWith('Unable to restore panel widths', expect.any(Error))
    },
  )

  it('keeps widths in memory when browser storage is unavailable', () => {
    const unavailable = new DOMException('Storage is blocked', 'SecurityError')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw unavailable
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw unavailable
    })
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(usePanelWidths)
    expect(result.current.widths).toEqual({ files: 240, assistant: 360 })
    act(() => result.current.saveWidths({ files: 300 }))
    expect(result.current.widths).toEqual({ files: 300, assistant: 360 })
    expect(report).toHaveBeenCalledWith('Unable to restore panel widths', unavailable)
    expect(report).toHaveBeenCalledWith('Unable to save panel widths', unavailable)
  })

  it('saves keyboard resizing but does not overwrite preferences on panel remount', async () => {
    const user = userEvent.setup()
    const page = render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    expect(localStorage.getItem(storageKey)).toBeNull()
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize files' }), {
      key: 'ArrowRight',
    })
    const stored = localStorage.getItem(storageKey)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? 'null').files).toBeCloseTo(315)
    await user.click(screen.getByRole('button', { name: 'Hide files' }))
    await user.click(screen.getByRole('button', { name: 'Open files' }))
    expect(localStorage.getItem(storageKey)).toBe(stored)
    page.unmount()
    render(
      <MemoryRouter initialEntries={['/files/getting-started']}>
        <Workbench />
      </MemoryRouter>,
    )
    await waitForWorkspace()
    expect(localStorage.getItem(storageKey)).toBe(stored)
    expect(screen.getByRole('separator', { name: 'Resize files' })).toHaveAttribute(
      'aria-valuenow',
      '21',
    )
  })
})
