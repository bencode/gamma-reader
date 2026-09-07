import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Workbench } from './workbench'

const material = (name: string) =>
  within(screen.getByRole('list', { name: 'Example documents' })).getByRole('button', { name })

describe('reading workspace', () => {
  it('opens unique tabs, chooses the right neighbor on close, and reopens from empty', async () => {
    const user = userEvent.setup()
    const network = vi.spyOn(globalThis, 'fetch')
    render(<Workbench />)
    await user.click(material('The art of noticing'))
    await user.click(material('Reading notes'))
    await user.click(material('The art of noticing'))
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Close The art of noticing' }))
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Close Getting started' }))
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Close Reading notes' }))
    await user.click(screen.getByRole('button', { name: 'Open Getting started' }))
    expect(screen.getByRole('heading', { name: 'A little room to read' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save to folder' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled()
    expect(network).not.toHaveBeenCalled()
  })

  it('keeps each tab scroll position and supports keyboard tab switching', async () => {
    const user = userEvent.setup()
    render(<Workbench />)
    const pane = screen.getByRole('tabpanel')
    const scroll = pane.querySelector('.document-scroll')
    if (!scroll) throw new Error('Document scroll container is missing')
    fireEvent.scroll(scroll, { target: { scrollTop: 260 } })
    await user.click(material('Reading notes'))
    await user.click(screen.getByRole('tab', { name: 'Getting started' }))
    expect(scroll.scrollTop).toBe(260)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps keyboard navigation in the reader after closing tabs', async () => {
    const user = userEvent.setup()
    render(<Workbench />)
    await user.click(material('The art of noticing'))
    await user.click(material('Reading notes'))
    await user.click(screen.getByRole('tab', { name: 'The art of noticing' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close The art of noticing' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Getting started' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: 'Getting started' })).toHaveFocus()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Open Getting started' })).toHaveFocus()
  })

  it('preserves a selected excerpt and question across document and panel changes', async () => {
    const user = userEvent.setup()
    render(<Workbench />)
    const text = screen.getByText(
      'This is your reading space. There is no folder to organize before you begin.',
    )
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.addRange(range)
    fireEvent.pointerUp(text)
    await user.click(screen.getByRole('button', { name: 'Ask AI' }))
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'What does this mean?')
    await user.click(material('Reading notes'))
    await user.click(screen.getByRole('button', { name: 'Close Getting started' }))
    await user.click(screen.getByRole('button', { name: 'Close reading assistant' }))
    await user.click(screen.getByRole('button', { name: 'Hide materials' }))
    await user.click(screen.getByRole('button', { name: 'Open reading assistant' }))
    expect(screen.getByRole('textbox')).toHaveValue('What does this mean?')
    expect(screen.getByText('Getting started.md')).toBeVisible()
    expect(screen.getByText(text.textContent ?? '')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove excerpt from Getting started.md' }))
    expect(screen.queryByText('Getting started.md')).not.toBeInTheDocument()
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
    render(<Workbench />)
    await user.click(
      screen.getByRole('button', { name: 'Explain the main idea in simpler terms.' }),
    )
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
    await user.click(screen.getByRole('button', { name: 'Open materials' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await user.click(material('Reading notes'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
