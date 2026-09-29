import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { legacyDatabaseName, projectDeletionPath, projectWindowName } from '../core/projects'
import { importStoredFiles, listStoredFiles } from '../data/file-store'
import {
  createProject,
  getProject,
  listProjects,
  schedulePendingDeletion,
} from '../data/project-store'
import { closeWorkspaceDatabase, setWorkspaceDatabaseName } from '../data/workspace-database'
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
    expect(others).toHaveAttribute('target', projectWindowName(first?.id ?? ''))

    setWorkspaceDatabaseName(legacyDatabaseName)
    expect(await fileNames()).not.toContain('Sightings.txt')
    setWorkspaceDatabaseName(birds.databaseName)
    expect(await fileNames()).toEqual(['Sightings.txt'])
  })

  it('deletes a project on the next page and can start again from an empty one', async () => {
    const user = userEvent.setup({ delay: null })
    // jsdom cannot load another page, so the next page is mounted by hand.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const [first] = await listProjects()
    const page = visit('/')
    await screen.findByRole('list', { name: 'Files' })
    localStorage.setItem('gamma-reader.workspace', JSON.stringify({ tabs: [], lastActiveId: null }))
    await user.click(screen.getByRole('button', { name: 'My reading' }))
    await user.click(await screen.findByRole('button', { name: 'Delete project…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete My reading' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    // Leaving a page closes the library it had open.
    page.unmount()
    await closeWorkspaceDatabase()

    visit(projectDeletionPath(first?.id ?? ''))
    expect(await screen.findByText('Create a project to add documents.')).toBeVisible()
    expect(await listProjects()).toEqual([])
    expect(localStorage.getItem('gamma-reader.workspace')).toBeNull()
    const name = screen.getByRole('textbox', { name: 'New project name' })
    await user.clear(name)
    await user.type(name, 'Fresh start{Enter}')
    const link = await screen.findByRole('link', { name: 'Open Fresh start' })
    const [created] = await listProjects()
    expect(link).toHaveAttribute('href', `/p/${created?.id}`)
    setWorkspaceDatabaseName(created?.databaseName ?? '')
    expect(await fileNames()).toEqual([])
  })

  it('deletes only what this tab asked for, once other tabs let go of it', async () => {
    const birds = await createProject('Bird notes')
    const page = visit(projectDeletionPath(birds.id))
    await screen.findByRole('list', { name: 'Files' })
    expect(await getProject(birds.id)).not.toBeNull()
    page.unmount()
    await closeWorkspaceDatabase()

    const otherTab = await openDB(birds.databaseName)
    schedulePendingDeletion(birds.id)
    visit(projectDeletionPath(birds.id))
    expect(
      await screen.findByText('Waiting for other tabs that have Bird notes open to close.'),
    ).toBeVisible()
    otherTab.close()
    expect(await screen.findByRole('button', { name: 'My reading' })).toBeInTheDocument()
    expect(await getProject(birds.id)).toBeNull()
  })
})
