import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rootSources } from '../core/files'
import { legacyDatabaseName, projectDeletionPath, projectWindowName } from '../core/projects'
import {
  getStoredFileContent,
  importStoredFiles,
  listStoredFiles,
  writeStoredTextFile,
} from '../data/file-store'
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
const fileNames = async () => (await listStoredFiles()).map(file => file.path)

describe('projects', () => {
  it('opens a deployment source as its project and brings in its changes on request', async () => {
    const user = userEvent.setup({ delay: null })
    const contents: Record<string, string> = {
      'knowledge/agents.md': '# Agents',
      'knowledge/old.md': '# Old',
      'journal/today.md': '# Today',
    }
    let version = 'v1'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url === '/api/agent/config') return Response.json({ enabled: false })
      if (url === '/api/source') return Response.json({ name: 'brain2', url: '/source/brain2' })
      if (url === '/source/brain2')
        return Response.json({
          version,
          files: Object.entries(contents).map(([path, text]) => ({
            path,
            version: `${version}:${text}`,
            size: text.length,
          })),
        })
      const path = decodeURIComponent(url.replace('/source/brain2/files/', ''))
      return new Response(contents[path] ?? '', { headers: { 'Content-Type': 'text/markdown' } })
    })
    const text = async (path: string) => {
      const file = (await listStoredFiles()).find(candidate => candidate.path === path)
      return file ? (await getStoredFileContent(file.id))?.text() : undefined
    }

    // Never synced here, so it comes in at once.
    visit('/')
    expect(await screen.findByText('brain2 is up to date.')).toBeVisible()
    expect(window.location.pathname).toMatch(/^\/p\/source-brain2(\/|$)/)
    expect((await fileNames()).sort()).toEqual([
      'journal/today.md',
      'knowledge/agents.md',
      'knowledge/old.md',
    ])

    await writeStoredTextFile('journal/today.md', '# Today, edited here')
    await writeStoredTextFile('journal/mine.md', '# Mine')
    contents['journal/today.md'] = '# Today, from the source'
    contents['knowledge/agents.md'] = '# Agents, revised'
    delete contents['knowledge/old.md']
    version = 'v2'
    cleanup()
    visit('/')
    // The source has the last word on what it changed, and says so before it does.
    expect(
      await screen.findByText(
        'brain2 has updates. Updating replaces your edits to journal/today.md.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Update' }))

    expect(
      await screen.findByText('brain2 is up to date. Replaced your edits to journal/today.md.'),
    ).toBeVisible()
    expect(screen.getByText('1 file changed only in this browser.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'About changes made here' }))
    expect(await screen.findByText(/Files added or edited here stay in this browser/)).toBeVisible()
    expect(await text('knowledge/agents.md')).toBe('# Agents, revised')
    expect(await text('journal/today.md')).toBe('# Today, from the source')
    expect(await text('journal/mine.md')).toBe('# Mine')
    expect(await fileNames()).not.toContain('knowledge/old.md')
  })

  it('opens the tutorial on a first visit, kept in step with the deployment', async () => {
    visit('/')

    expect(await screen.findByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(await screen.findByText('Tutorial is up to date.')).toBeVisible()
    expect(window.location.pathname).toMatch(/^\/p\/tutorial(\/|$)/)
    expect((await listProjects()).map(project => project.name)).toEqual(['Tutorial'])
  })

  it('adds the tutorial to projects kept before it, without leaving the one in use', async () => {
    const registry = await openDB('gamma-reader-projects', 1, {
      upgrade(database) {
        const projects = database.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-last-active', 'lastActiveAt')
      },
    })
    await registry.put('projects', {
      id: 'first',
      name: 'My reading',
      databaseName: legacyDatabaseName,
      createdAt: 1,
      lastActiveAt: 1,
    })
    registry.close()
    await importStoredFiles(
      rootSources([new File(['# Notes'], 'Notes.md', { type: 'text/markdown' })]),
      'keep',
    )
    visit('/files/Notes.md')

    expect(await screen.findByRole('tab', { name: 'Notes.md' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/p/first/files/Notes.md')
    expect(document.title).toBe('My reading · Gamma Reader')
    expect((await listProjects()).map(project => project.name)).toEqual(['My reading', 'Tutorial'])
  })

  it('keeps the files of one project out of another', async () => {
    const user = userEvent.setup({ delay: null })
    const [first] = await listProjects()
    const birds = await createProject('Bird notes')
    visit(`/p/${birds.id}`)

    expect(await screen.findByText('Add a document when you are ready to read.')).toBeVisible()
    await importStoredFiles(
      rootSources([new File(['Wren'], 'Sightings.txt', { type: 'text/plain' })]),
      'keep',
    )
    await user.click(screen.getByRole('button', { name: 'Bird notes' }))
    const others = await screen.findByRole('link', { name: 'Tutorial' })
    expect(others).toHaveAttribute('href', `/p/${first?.id}`)
    expect(others).toHaveAttribute('target', projectWindowName(first?.id ?? ''))

    setWorkspaceDatabaseName(first?.databaseName ?? '')
    expect(await fileNames()).not.toContain('Sightings.txt')
    setWorkspaceDatabaseName(birds.databaseName)
    expect(await fileNames()).toEqual(['Sightings.txt'])
  })

  it('deletes the tutorial on the next page, and the next visit brings it back afresh', async () => {
    const user = userEvent.setup({ delay: null })
    // jsdom cannot load another page, so the next page is mounted by hand.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const [first] = await listProjects()
    const page = visit('/')
    await screen.findByText('Tutorial is up to date.')
    await writeStoredTextFile('Mine.md', '# Mine')
    await user.click(screen.getByRole('button', { name: 'Tutorial' }))
    await user.click(await screen.findByRole('button', { name: 'Delete project…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Tutorial' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }))
    // Leaving a page closes the library it had open.
    page.unmount()
    await closeWorkspaceDatabase()

    visit(projectDeletionPath(first?.id ?? ''))
    expect(await screen.findByText('Tutorial is up to date.')).toBeVisible()
    expect((await listProjects()).map(project => project.name)).toEqual(['Tutorial'])
    expect(await fileNames()).toEqual([])
  })

  it('deletes only what this tab asked for, once other tabs let go of it', async () => {
    const birds = await createProject('Bird notes')
    const page = visit(projectDeletionPath(birds.id))
    // Which project opens depends on recency, and a new one is empty, so wait for the panel only.
    await screen.findByRole('complementary', { name: 'Files' })
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
    expect(await screen.findByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(await getProject(birds.id)).toBeNull()
  })

  it('opens another project when the address names one whose deletion is still waiting', async () => {
    const birds = await createProject('Bird notes')
    // Another tab holds the library, so its deletion waits.
    const otherTab = await openDB(birds.databaseName)
    schedulePendingDeletion(birds.id)
    visit(projectDeletionPath(birds.id))
    expect(
      await screen.findByText('Waiting for other tabs that have Bird notes open to close.'),
    ).toBeVisible()

    // The project is already gone, so its address leads elsewhere instead of to a blank page.
    cleanup()
    visit(`/p/${birds.id}`)
    expect(await screen.findByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    otherTab.close()
  })

  it('waits for an older tab to let go before upgrading the library, then opens it', async () => {
    const birds = await createProject('Bird notes')
    // An older page still holds the version-six library and does not know to let go.
    const olderTab = await openDB(birds.databaseName, 6, {
      upgrade(database) {
        const files = database.createObjectStore('files', { keyPath: 'id' })
        files.createIndex('by-created-at', 'createdAt')
        database.createObjectStore('contents', { keyPath: 'id' })
        database.createObjectStore('conversations', { keyPath: 'id' })
        database.createObjectStore('messages', { keyPath: ['conversationId', 'position'] })
        database.createObjectStore('folderExports', { keyPath: 'id' })
        files.put({
          id: 'old',
          name: 'Old.md',
          collection: 'files',
          mediaType: 'text/markdown',
          previewKind: 'markdown',
          size: 1,
          lastModified: 1,
          createdAt: 1,
          revision: 1,
        })
      },
    })
    visit(`/p/${birds.id}`)

    expect(
      await screen.findByText('Waiting for other tabs that have Bird notes open to close.'),
    ).toBeVisible()
    olderTab.close()
    const files = await screen.findByRole('list', { name: 'Files' })
    expect(within(files).getByRole('button', { name: 'Old.md' })).toBeInTheDocument()
  })
})
