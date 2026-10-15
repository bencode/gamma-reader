import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeStoredTextFile } from '../data/file-store'
import { testProject } from '../test/project'
import { Workbench } from './workbench'

beforeEach(async () => {
  await writeStoredTextFile('series/a.md', '# Alpha\n\n[Next](./b.md)')
  await writeStoredTextFile('series/b.md', '# Beta')
  await writeStoredTextFile('unread.md', '# Unread')
})

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

const openReader = (path = '/files/series/a.md') =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Workbench project={testProject} />
        <Navigation />
      </MemoryRouter>
    </StrictMode>,
  )
const view = (name: string) =>
  within(screen.getByRole('group', { name: 'File views' })).getByRole('button', { name })
const heading = (name: string) => screen.findByRole('heading', { name }, { timeout: 5000 })
const list = (name: string) => within(screen.getByRole('list', { name }))
const names = (name: string) =>
  list(name)
    .getAllByRole('button', { current: 'page' })
    .map(button => button.textContent)

describe('recent and starred file navigation', () => {
  it('records links, tabs and browser history even while the sidebar is closed', async () => {
    const user = userEvent.setup({ delay: null })
    openReader()
    await heading('Alpha')
    await user.click(screen.getByRole('button', { name: 'Hide files' }))
    await user.click(screen.getByRole('link', { name: 'Next' }))
    await heading('Beta')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await heading('Alpha')
    await user.click(screen.getByRole('button', { name: 'Forward' }))
    await heading('Beta')
    await user.click(screen.getByRole('tab', { name: 'a.md' }))
    await heading('Alpha')
    await user.click(screen.getByRole('button', { name: 'Open files' }))
    await user.click(view('Recent'))
    const rows = screen.getByRole('list', { name: 'Recent' }).querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('a.md')
    expect(rows[1]).toHaveTextContent('b.md')
    expect(rows[0]?.querySelector('time')?.getAttribute('datetime')).toBeTruthy()
    expect(list('Recent').queryByRole('button', { name: /unread.md/ })).toBeNull()
  })

  it('persists stars and view, and unstars without closing or deleting the open file', async () => {
    const user = userEvent.setup({ delay: null })
    const page = openReader()
    await heading('Alpha')
    await user.click(list('Files').getByRole('button', { name: 'Star series/a.md' }))
    await user.click(list('Files').getByRole('button', { name: 'Star series/b.md' }))
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeVisible()
    await user.click(view('Starred'))
    expect(screen.getByRole('list', { name: 'Starred' }).querySelector('li')).toHaveTextContent(
      'b.md',
    )
    page.unmount()
    openReader('/')
    await heading('Alpha')
    expect(view('Starred')).toHaveAttribute('aria-pressed', 'true')
    await user.click(list('Starred').getByRole('button', { name: 'Unstar series/a.md' }))
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeVisible()
    expect(list('Starred').queryByRole('button', { name: /a.md/ })).toBeNull()
    await user.click(list('Starred').getByRole('button', { name: 'Remove series/b.md from Files' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove series/b.md' })).getByRole('button', {
        name: 'Remove',
      }),
    )
    await screen.findByText('Star a file to find it here quickly.')
    await user.click(view('Recent'))
    expect(names('Recent')[0]).toContain('a.md')
    await user.click(view('Files'))
    expect(list('Files').getByRole('button', { name: 'a.md' })).toBeVisible()
    expect(list('Files').queryByRole('button', { name: 'b.md' })).toBeNull()
  })

  it('filters the selected view, preserves the query and opens its first matching item', async () => {
    const user = userEvent.setup({ delay: null })
    openReader()
    await heading('Alpha')
    await user.click(list('Files').getByRole('button', { name: 'b.md' }))
    await heading('Beta')
    await user.type(screen.getByRole('searchbox', { name: 'Filter files' }), 'series')
    await user.click(view('Recent'))
    const filter = screen.getByRole('searchbox', { name: 'Filter recent files' })
    expect(filter).toHaveValue('series')
    await user.click(filter)
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/files/series/b.md')
    await user.clear(filter)
    await user.type(filter, 'unread')
    await screen.findByText('No matching recent files')
    await user.click(view('Files'))
    expect(screen.getByRole('searchbox', { name: 'Filter files' })).toHaveValue('unread')
    expect(list('Files').getByRole('button', { name: 'unread.md' })).toBeVisible()
    await user.click(view('Starred'))
    await screen.findByText('No matching starred files')
    await user.click(screen.getByRole('searchbox', { name: 'Filter starred files' }))
    await user.keyboard('{Escape}')
    await screen.findByText('Star a file to find it here quickly.')
    await user.click(view('Files'))
    await waitFor(() =>
      expect(list('Files').getByRole('button', { name: 'series' })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    )
  })
})
