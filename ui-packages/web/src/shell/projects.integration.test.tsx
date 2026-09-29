import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { legacyDatabaseName } from '../core/projects'
import { importStoredFiles, listStoredFiles } from '../data/file-store'
import { createProject, listProjects } from '../data/project-store'
import { setWorkspaceDatabaseName } from '../data/workspace-database'
import { ProjectRoot } from './project-root'

beforeEach(() => {
  // Lab samples mount CodeMirror, which measures text geometry unavailable in jsdom.
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 20)] as unknown as DOMRectList
})

const visit = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<ProjectRoot />)
}
const fileNames = async () => (await listStoredFiles()).map(file => file.name)

describe('projects', () => {
  it('opens the library kept before projects as the first project', async () => {
    await importStoredFiles([new File(['# Notes'], 'Notes.md', { type: 'text/markdown' })], 'keep')
    visit('/files/Notes.md')

    expect(await screen.findByRole('tab', { name: 'Notes.md' })).toBeInTheDocument()
    expect(window.location.pathname).toMatch(/^\/p\/[^/]+\/files\/Notes\.md$/)
    expect(screen.getByRole('button', { name: 'My reading' })).toBeInTheDocument()
    expect(document.title).toBe('My reading · Gamma Reader')
  })

  it('keeps the files of one project out of another', async () => {
    const user = userEvent.setup({ delay: null })
    const [first] = await listProjects()
    const birds = await createProject('Bird notes')
    visit(`/p/${birds.id}`)

    expect(await screen.findByText('Add a document when you are ready to read.')).toBeVisible()
    await importStoredFiles([new File(['Wren'], 'Sightings.txt', { type: 'text/plain' })], 'keep')
    await user.click(screen.getByRole('button', { name: 'Bird notes' }))
    const others = await screen.findByRole('link', { name: 'My reading' })
    expect(others).toHaveAttribute('href', `/p/${first?.id}`)
    expect(others).toHaveAttribute('target', '_blank')

    setWorkspaceDatabaseName(legacyDatabaseName)
    expect(await fileNames()).not.toContain('Sightings.txt')
    setWorkspaceDatabaseName(birds.databaseName)
    expect(await fileNames()).toEqual(['Sightings.txt'])
  })

  it('can delete every project and start again from an empty one', async () => {
    const user = userEvent.setup({ delay: null })
    // jsdom cannot load another page; the reload that follows a deletion is not under test.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const first = visit('/')
    await screen.findByRole('list', { name: 'Files' })
    await user.click(screen.getByRole('button', { name: 'My reading' }))
    await user.click(await screen.findByRole('button', { name: 'Delete project…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete My reading' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    await waitFor(async () => expect(await listProjects()).toEqual([]))
    first.unmount()

    visit('/')
    expect(await screen.findByText('Create a project to add documents.')).toBeVisible()
    const name = screen.getByRole('textbox', { name: 'New project name' })
    await user.clear(name)
    await user.type(name, 'Fresh start{Enter}')
    const link = await screen.findByRole('link', { name: 'Open Fresh start' })
    const [created] = await listProjects()
    expect(link).toHaveAttribute('href', `/p/${created?.id}`)
    setWorkspaceDatabaseName(created?.databaseName ?? '')
    expect(await fileNames()).toEqual([])
  })
})
