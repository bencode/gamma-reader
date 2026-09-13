import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Workbench } from './workbench'

const storageKey = 'gamma-reader.workspace'
const file = (name: string) =>
  within(screen.getByRole('list', { name: 'Files' })).getByRole('button', { name })
const tabNames = () => screen.queryAllByRole('tab').map(tab => tab.textContent)
const savedWorkspace = () => JSON.parse(localStorage.getItem(storageKey) ?? 'null')
const waitForWorkspace = () => screen.findByRole('tab', { name: 'Getting started.md' })

const Navigation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="Current route">{location.pathname}</output>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
    </>
  )
}

const openReader = (path = '/') =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Workbench />
        <Navigation />
      </MemoryRouter>
    </StrictMode>,
  )

describe('local workspace navigation', () => {
  it('restores tab order, the active document, and the conversation draft', async () => {
    const user = userEvent.setup()
    const page = openReader()
    await waitForWorkspace()
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/getting-started'),
    )
    await user.click(file('Reading notes.md'))
    await user.click(file('The art of noticing.md'))
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
    await user.type(screen.getByRole('textbox'), 'A saved question')
    expect(savedWorkspace()).toEqual({
      tabs: ['getting-started', 'reading-notes', 'art-of-noticing'],
      lastActiveId: 'art-of-noticing',
    })
    await waitFor(() =>
      expect(localStorage.getItem('gamma-reader.active-conversation')).not.toBeNull(),
    )
    page.unmount()
    openReader()
    await waitForWorkspace()
    expect(tabNames()).toEqual(['Getting started.md', 'Reading notes.md', 'The art of noticing.md'])
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/art-of-noticing'),
    )
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('A saved question'))
  })

  it('lets a document route override the saved selection and append a missing tab', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ tabs: ['reading-notes'], lastActiveId: 'reading-notes' }),
    )
    openReader('/files/art-of-noticing')
    await screen.findByRole('tab', { name: 'The art of noticing.md' })
    expect(tabNames()).toEqual(['Reading notes.md', 'The art of noticing.md'])
    expect(screen.getByRole('tab', { name: 'The art of noticing.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(savedWorkspace().lastActiveId).toBe('art-of-noticing')
  })

  it('navigates history without undoing the local tab list or adding duplicate active entries', async () => {
    const user = userEvent.setup()
    openReader()
    await waitForWorkspace()
    await user.click(file('The art of noticing.md'))
    await user.click(file('Reading notes.md'))
    await user.click(screen.getByRole('tab', { name: 'Reading notes.md' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/art-of-noticing')
    expect(tabNames()).toEqual(['Getting started.md', 'The art of noticing.md', 'Reading notes.md'])
    await user.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/reading-notes')
    await user.click(screen.getByRole('tab', { name: 'The art of noticing.md' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/reading-notes')
    await user.click(screen.getByRole('button', { name: 'Close The art of noticing.md' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(tabNames()).toEqual(['Getting started.md', 'Reading notes.md', 'The art of noticing.md'])
    expect(screen.getByRole('tab', { name: 'The art of noticing.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('restores an intentionally empty workspace after closing its last tab', async () => {
    const user = userEvent.setup()
    const page = openReader()
    await waitForWorkspace()
    await user.click(screen.getByRole('button', { name: 'Close Getting started.md' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files')
    expect(savedWorkspace()).toEqual({ tabs: [], lastActiveId: null })
    page.unmount()
    openReader()
    await screen.findByRole('button', { name: 'Open Getting started.md' })
    expect(tabNames()).toEqual([])
  })

  it('does not open an unknown route as a file or discard existing tabs', async () => {
    openReader('/files/not-in-this-browser')
    await waitForWorkspace()
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/files$/),
    )
    expect(tabNames()).toEqual(['Getting started.md'])
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(savedWorkspace()).toEqual({ tabs: ['getting-started'], lastActiveId: null })
  })

  it('restores defaults and reports damaged storage', async () => {
    localStorage.setItem(storageKey, '{')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    openReader()
    await waitForWorkspace()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Getting started.md' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(report).toHaveBeenCalledWith('Unable to restore workspace', expect.any(Error))
  })

  it('still opens and closes documents when storage is blocked', async () => {
    const user = userEvent.setup()
    const blocked = new DOMException('Storage is blocked', 'SecurityError')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw blocked
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw blocked
    })
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    openReader()
    await waitForWorkspace()
    await user.click(file('Reading notes.md'))
    await user.click(screen.getByRole('button', { name: 'Close Getting started.md' }))
    expect(tabNames()).toEqual(['Reading notes.md'])
    expect(screen.getByRole('tab', { name: 'Reading notes.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(report).toHaveBeenCalledWith('Unable to save workspace', blocked)
  })

  it('restores an Activity document position without adding a selection toolbar', async () => {
    const user = userEvent.setup()
    openReader()
    await waitForWorkspace()
    await screen.findByRole('heading', { name: 'A little room to read' })
    const pane = screen.getByRole('tabpanel')
    const scroll = pane.querySelector('.document-scroll')
    if (!scroll) throw new Error('Document scroll container is missing')
    fireEvent.scroll(scroll, { target: { scrollTop: 180 } })
    const text = screen.getByText(
      'This is your reading space. There is no folder to organize before you begin.',
    )
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.addRange(range)
    fireEvent.pointerUp(text)
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
    await user.click(file('Reading notes.md'))
    expect(pane).not.toBeVisible()
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Getting started.md' }))
    await waitFor(() => expect(pane).toBeVisible())
    expect(scroll.scrollTop).toBe(180)
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
  })
})
