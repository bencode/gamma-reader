import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as background from '../../core/agent/background'
import { workspaceDatabaseName } from '../../data/workspace-database'
import { reader, seedConversation } from './curator/fixtures'
import type { MemoryEntry } from './entry'
import { MemoryPage } from './memory-page'
import { memoryEnabled, setMemoryEnabled } from './settings'
import { listMemories, saveMemory } from './store'

const entry = (id: string, text: string, scope: MemoryEntry['scope'] = 'reader'): MemoryEntry => ({
  id,
  text,
  scope,
  core: false,
  projectKey: 'gamma-reader-project-gone',
  conversationId: 'c',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  confirmedAt: Date.now(),
  tags: [],
  sources: [],
})

describe('memory page', () => {
  afterEach(() => setMemoryEnabled(false))

  it('turns memory on for the whole browser', async () => {
    render(<MemoryPage active />)
    await userEvent.click(screen.getByLabelText('Let the assistant remember what you ask it to'))
    expect(memoryEnabled()).toBe(true)
  })

  it('finds a note by a term the word segmenter would split', async () => {
    await saveMemory(entry('closure', '读者理解了闭包，但尾递归还不熟'))
    await saveMemory(entry('style', 'Prefers short answers'))
    render(<MemoryPage active />)
    await screen.findByText('Prefers short answers')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search memory' }), '尾递归')

    const results = await screen.findByRole('region', { name: 'Search results' })
    expect(results).toHaveTextContent('读者理解了闭包')
    expect(results).not.toHaveTextContent('Prefers short answers')
  })

  it('corrects and deletes a note', async () => {
    await saveMemory(entry('style', 'Prefers long answers'))
    await saveMemory(entry('reading', 'Reading SICP 1.2', 'project'))
    render(<MemoryPage active />)
    expect(await screen.findByRole('region', { name: 'Deleted project' })).toHaveTextContent(
      'Reading SICP 1.2',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Edit “Prefers long answers”' }))
    const note = screen.getByRole('textbox', { name: 'Note' })
    await userEvent.clear(note)
    await userEvent.type(note, 'Prefers short answers')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Keep in mind in every conversation' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const about = await screen.findByRole('region', { name: 'About you' })
    await within(about).findByText('Prefers short answers')

    await userEvent.click(screen.getByRole('button', { name: 'Delete “Reading SICP 1.2”' }))
    await waitFor(() => expect(screen.queryByText('Reading SICP 1.2')).toBeNull())
    expect(await listMemories()).toEqual([
      expect.objectContaining({ id: 'style', text: 'Prefers short answers', core: true }),
    ])
  })

  it('searches by a tag, and organizes waiting conversations on request', async () => {
    setMemoryEnabled(true)
    const organize = vi.spyOn(background, 'runBackgroundAgent').mockResolvedValue(null)
    await seedConversation('waiting', 0, [reader('一'), reader('二'), reader('三')])
    await saveMemory({ ...entry('tagged', 'Reading SICP'), tags: ['SICP'] })
    await saveMemory(entry('other', 'Prefers short answers'))
    render(<MemoryPage active />)

    await userEvent.click(await screen.findByRole('button', { name: 'SICP' }))
    expect(screen.getByRole('searchbox', { name: 'Search memory' })).toHaveValue('SICP')
    expect(await screen.findByRole('region', { name: 'Search results' })).not.toHaveTextContent(
      'Prefers short answers',
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Organize now' }))
    expect(organize).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'curator' }),
      workspaceDatabaseName(),
      { untilDone: true },
    )
  })

  it('lists merged notes apart and restores one', async () => {
    await saveMemory(entry('new', 'Understands recursion'))
    await saveMemory({ ...entry('old', 'Stuck on recursion'), mergedInto: 'new' })
    render(<MemoryPage active />)

    const about = await screen.findByRole('region', { name: 'About you' })
    expect(about).not.toHaveTextContent('Stuck on recursion')
    await userEvent.click(screen.getByText(/Merged notes \(1\)/))
    await userEvent.click(screen.getByRole('button', { name: 'Restore “Stuck on recursion”' }))

    await waitFor(() => expect(about).toHaveTextContent('Stuck on recursion'))
  })

  it('shows a note saved while it is open', async () => {
    render(<MemoryPage active />)
    await screen.findByText(/Nothing remembered yet/)
    await saveMemory(entry('new', 'Reads in the evening'))
    expect(await screen.findByText('Reads in the evening')).toBeInTheDocument()
  })
})
