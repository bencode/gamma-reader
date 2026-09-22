import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { samples } from '../core/samples'
import { Workbench } from './workbench'

beforeEach(() => {
  // Lab samples mount CodeMirror, which measures text geometry unavailable in jsdom.
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
})

const storageKey = 'gamma-reader.workspace'
const file = (name: string) =>
  within(screen.getByRole('list', { name: 'Files' })).getByRole('button', { name })
const tabNames = () => screen.queryAllByRole('tab').map(tab => tab.textContent)
// The workspace file keeps ids; the address shows names.
const routeFor = (id: string | null) => {
  const name = samples.find(sample => sample.id === id)?.name
  return name ? `/files/${encodeURIComponent(name)}` : '/files'
}
const savedWorkspace = () => JSON.parse(localStorage.getItem(storageKey) ?? 'null')
const waitForWorkspace = async () => {
  const panel = await screen.findByRole('complementary', { name: 'Files' })
  const list = await within(panel).findByRole('list', { name: 'Files' })
  return within(list).findByRole('button', { name: 'Start here.md' })
}

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
    const user = userEvent.setup({ delay: null })
    const page = openReader()
    await waitForWorkspace()
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent('/files'))
    await user.click(file('Start here.md'))
    await user.click(file('Explore a wave.lab.md'))
    await user.click(file('How Gamma Reader works.svg'))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Your question' })).toBeEnabled(),
    )
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'A saved question')
    expect(savedWorkspace()).toEqual({
      tabs: ['getting-started', 'explore-wave', 'how-gamma-reader-works'],
      lastActiveId: 'how-gamma-reader-works',
    })
    await waitFor(() =>
      expect(localStorage.getItem('gamma-reader.active-conversation')).not.toBeNull(),
    )
    page.unmount()
    openReader()
    await waitForWorkspace()
    expect(tabNames()).toEqual([
      'Start here.md',
      'Explore a wave.lab.md',
      'How Gamma Reader works.svg',
    ])
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent(
        routeFor('how-gamma-reader-works'),
      ),
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue(
        'A saved question',
      ),
    )
  })

  it('lets a document route override the saved selection and append a missing tab', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ tabs: ['explore-wave'], lastActiveId: 'explore-wave' }),
    )
    openReader('/files/getting-started')
    await screen.findByRole('tab', { name: 'Start here.md' })
    expect(tabNames()).toEqual(['Explore a wave.lab.md', 'Start here.md'])
    expect(screen.getByRole('tab', { name: 'Start here.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(savedWorkspace().lastActiveId).toBe('getting-started')
  })

  it('navigates history without undoing the local tab list or adding duplicate active entries', async () => {
    const user = userEvent.setup({ delay: null })
    openReader()
    await waitForWorkspace()
    await user.click(file('Start here.md'))
    await user.click(file('How Gamma Reader works.svg'))
    await user.click(file('Explore a wave.lab.md'))
    await user.click(screen.getByRole('tab', { name: 'Explore a wave.lab.md' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'How Gamma Reader works.svg' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(tabNames()).toEqual([
      'Start here.md',
      'How Gamma Reader works.svg',
      'Explore a wave.lab.md',
    ])
    await user.click(screen.getByRole('button', { name: 'Forward' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Explore a wave.lab.md' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(tabNames()).toEqual([
      'Start here.md',
      'How Gamma Reader works.svg',
      'Explore a wave.lab.md',
    ])
    await user.click(screen.getByRole('tab', { name: 'How Gamma Reader works.svg' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Explore a wave.lab.md' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Close How Gamma Reader works.svg' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'How Gamma Reader works.svg' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
    expect(tabNames()).toEqual([
      'Start here.md',
      'Explore a wave.lab.md',
      'How Gamma Reader works.svg',
    ])
  })

  it('starts empty and restores an intentionally empty workspace', async () => {
    const user = userEvent.setup({ delay: null })
    const page = openReader()
    await waitForWorkspace()
    await screen.findByRole('heading', { name: 'Start with a document' })
    expect(tabNames()).toEqual([])
    await waitFor(() => expect(savedWorkspace()).toEqual({ tabs: [], lastActiveId: null }))

    await user.click(screen.getByRole('button', { name: 'Open Start here.md' }))
    await screen.findByRole('tab', { name: 'Start here.md' })
    await user.click(screen.getByRole('button', { name: 'Close Start here.md' }))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files')
    expect(savedWorkspace()).toEqual({ tabs: [], lastActiveId: null })
    page.unmount()

    openReader()
    await screen.findByRole('button', { name: 'Open Start here.md' })
    expect(tabNames()).toEqual([])
  })

  it('does not open an unknown route as a file or create a tab', async () => {
    openReader('/files/not-in-this-browser')
    await waitForWorkspace()
    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/files$/),
    )
    expect(tabNames()).toEqual([])
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(savedWorkspace()).toEqual({ tabs: [], lastActiveId: null })
  })

  it('restores empty defaults and reports damaged storage', async () => {
    localStorage.setItem(storageKey, '{')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    openReader()
    await waitForWorkspace()
    expect(await screen.findByRole('heading', { name: 'Start with a document' })).toBeVisible()
    expect(tabNames()).toEqual([])
    expect(report).toHaveBeenCalledWith('Unable to restore workspace', expect.any(Error))
  })

  it('still opens and closes documents when storage is blocked', async () => {
    const user = userEvent.setup({ delay: null })
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
    await user.click(file('Start here.md'))
    await user.click(file('Explore a wave.lab.md'))
    await user.click(screen.getByRole('button', { name: 'Close Start here.md' }))
    expect(tabNames()).toEqual(['Explore a wave.lab.md'])
    expect(screen.getByRole('tab', { name: 'Explore a wave.lab.md' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(report).toHaveBeenCalledWith('Unable to save workspace', blocked)
  })

  it('restores an Activity document position without adding a selection toolbar', async () => {
    const user = userEvent.setup({ delay: null })
    openReader()
    await waitForWorkspace()
    await user.click(file('Start here.md'))
    await screen.findByRole('heading', { name: 'Start here' })
    const pane = screen.getByRole('tabpanel')
    const scroll = pane.querySelector('.document-scroll')
    if (!scroll) throw new Error('Document scroll container is missing')
    fireEvent.scroll(scroll, { target: { scrollTop: 180 } })
    const text = screen.getByText(
      'Read, experiment, and create with AI, using files that stay in your browser.',
    )
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()?.addRange(range)
    fireEvent.pointerUp(text)
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
    await user.click(file('Explore a wave.lab.md'))
    expect(pane).not.toBeVisible()
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Start here.md' }))
    await waitFor(() => expect(pane).toBeVisible())
    expect(scroll.scrollTop).toBe(180)
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
  })
  it('opens a document whose name differs only in case, as a rename leaves behind', async () => {
    // The write tool replaces a file it matched without regard to case, so the name in an
    // address can fall out of step with the one on the file by exactly that much.
    openReader('/files/start HERE.md')
    const tab = await screen.findByRole('tab', { name: 'Start here.md' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })
})

describe('bulk tab navigation', () => {
  it.each([
    {
      command: 'Close others',
      target: 'How Gamma Reader works.svg',
      remaining: ['How Gamma Reader works.svg'],
      active: 'how-gamma-reader-works',
    },
    {
      command: 'Close to the right',
      target: 'Start here.md',
      remaining: ['Start here.md'],
      active: 'getting-started',
    },
    {
      command: 'Close',
      target: 'How Gamma Reader works.svg',
      remaining: ['Start here.md', 'Explore a wave.lab.md'],
      active: 'explore-wave',
    },
    { command: 'Close all', target: 'Start here.md', remaining: [], active: null },
  ])(
    '$command preserves the correct selection and stored tab list',
    async ({ command, target, remaining, active }) => {
      const user = userEvent.setup({ delay: null })
      openReader()
      await waitForWorkspace()
      await user.click(file('Start here.md'))
      await user.click(file('How Gamma Reader works.svg'))
      await user.click(file('Explore a wave.lab.md'))
      const selected = screen.getByRole('tab', { name: 'Explore a wave.lab.md' })
      fireEvent.contextMenu(screen.getByRole('tab', { name: target }))
      expect(selected).toHaveAttribute('aria-selected', 'true')
      await user.click(screen.getByRole('menuitem', { name: command }))
      await waitFor(() => expect(tabNames()).toEqual(remaining))
      expect(savedWorkspace().lastActiveId).toBe(active)
      expect(screen.getByLabelText('Current route').textContent).toBe(routeFor(active))
      if (active) expect(screen.getByRole('tab', { selected: true })).toHaveFocus()
      else expect(screen.getByRole('button', { name: 'Open Start here.md' })).toHaveFocus()
      expect(
        within(screen.getByRole('list', { name: 'Files' })).getByRole('button', { name: target }),
      ).toBeVisible()
    },
  )
})
