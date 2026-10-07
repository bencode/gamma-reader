import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoryEntry } from './entry'
import { MemoryDialog } from './memory-dialog'
import { memoryEnabled, setMemoryEnabled } from './settings'
import { listMemories, saveMemory } from './store'

const entry = (id: string, text: string, scope: MemoryEntry['scope']): MemoryEntry => ({
  id,
  text,
  scope,
  core: false,
  projectKey: 'gamma-reader-project-gone',
  conversationId: 'c',
  createdAt: 1,
  confirmedAt: 1,
})

describe('memory dialog', () => {
  afterEach(() => setMemoryEnabled(false))

  it('turns memory on for the whole browser', async () => {
    render(<MemoryDialog onClose={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Let the assistant remember what you ask it to'))
    expect(memoryEnabled()).toBe(true)
  })

  it('deletes a remembered note', async () => {
    await saveMemory(entry('style', 'Prefers short answers', 'reader'))
    await saveMemory(entry('reading', 'Reading SICP 1.2', 'project'))
    render(<MemoryDialog onClose={vi.fn()} />)

    expect(await screen.findByRole('region', { name: 'Deleted project' })).toHaveTextContent(
      'Reading SICP 1.2',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete “Prefers short answers”' }))

    await waitFor(() => expect(screen.queryByText('Prefers short answers')).toBeNull())
    expect((await listMemories()).map(saved => saved.id)).toEqual(['reading'])
  })
})
