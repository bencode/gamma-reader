import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { MemoryEntry } from './entry'
import { MemoryPage } from './memory-page'
import { listMemories, saveMemory } from './store'

const entry = (id: string, text: string, scope: MemoryEntry['scope'] = 'reader'): MemoryEntry => ({
  id,
  text,
  scope,
  core: false,
  projectKey: 'gamma-reader-project-gone',
  conversationId: 'c',
  createdAt: Date.now(),
  confirmedAt: Date.now(),
})

describe('memory page', () => {
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

  it('shows a note saved while it is open', async () => {
    render(<MemoryPage active />)
    await screen.findByText(/Nothing remembered yet/)
    await saveMemory(entry('new', 'Reads in the evening'))
    expect(await screen.findByText('Reads in the evening')).toBeInTheDocument()
  })
})
