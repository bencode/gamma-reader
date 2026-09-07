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
  it('restores tab order and the last active document without saving drafts or excerpts', async () => {
    const user = userEvent.setup()
    const page = openReader()
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/getting-started')
    await user.click(file('Reading notes'))
    await user.click(file('The art of noticing'))
    await user.type(screen.getByRole('textbox'), 'An unsaved question')
    expect(savedWorkspace()).toEqual({
      tabs: ['getting-started', 'reading-notes', 'art-of-noticing'],
      lastActiveId: 'art-of-noticing',
    })
    page.unmount()
    openReader()
    expect(tabNames()).toEqual(['Getting started', 'Reading notes', 'The art of noticing'])
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/art-of-noticing')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('lets a document route override the saved selection and append a missing tab', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ tabs: ['reading-notes'], lastActiveId: 'reading-notes' }),
    )
    openReader('/files/art-of-noticing')
    expect(tabNames()).toEqual(['Reading notes', 'The art of noticing'])
    expect(screen.getByRole('tab', { name: 'The art of noticing' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(savedWorkspace().lastActiveId).toBe('art-of-noticing')
  })

  it('navigates history without undoing the local tab list or adding duplicate active entries', async () => {
    const user = userEvent.setup()
    openReader()
    await user.click(file('The art of noticing'))
    await user.click(file('Reading notes'))
    await user.click(screen.getByRole('tab', { name: 'Reading notes' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/art-of-noticing')
    expect(tabNames()).toEqual(['Getting started', 'The art of noticing', 'Reading notes'])
    await user.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/reading-notes')
    await user.click(screen.getByRole('tab', { name: 'The art of noticing' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/reading-notes')
    await user.click(screen.getByRole('button', { name: 'Close The art of noticing' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(tabNames()).toEqual(['Getting started', 'Reading notes', 'The art of noticing'])
    expect(screen.getByRole('tab', { name: 'The art of noticing' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('restores an intentionally empty workspace after closing its last tab', async () => {
    const user = userEvent.setup()
    const page = openReader()
    await user.click(screen.getByRole('button', { name: 'Close Getting started' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files')
    expect(savedWorkspace()).toEqual({ tabs: [], lastActiveId: null })
    page.unmount()
    openReader()
    expect(tabNames()).toEqual([])
    expect(screen.getByRole('button', { name: 'Open Getting started' })).toBeVisible()
  })

  it('does not open an unknown route as a file or discard existing tabs', () => {
    openReader('/files/not-in-this-browser')
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/files$/)
    expect(tabNames()).toEqual(['Getting started'])
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(savedWorkspace()).toEqual({ tabs: ['getting-started'], lastActiveId: null })
  })

  it('restores defaults and reports damaged storage', () => {
    localStorage.setItem(storageKey, '{')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    openReader()
    expect(screen.getByRole('tab', { name: 'Getting started' })).toHaveAttribute(
      'aria-selected',
      'true',
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
    await user.click(file('Reading notes'))
    await user.click(screen.getByRole('button', { name: 'Close Getting started' }))
    expect(tabNames()).toEqual(['Reading notes'])
    expect(screen.getByRole('tab', { name: 'Reading notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(report).toHaveBeenCalledWith('Unable to save workspace', blocked)
  })

  it('restores an Activity document position without resurrecting its selection toolbar', async () => {
    const user = userEvent.setup()
    openReader()
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
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeVisible()
    await user.click(file('Reading notes'))
    expect(pane).not.toBeVisible()
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Getting started' }))
    await waitFor(() => expect(pane).toBeVisible())
    expect(scroll.scrollTop).toBe(180)
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
  })
})
