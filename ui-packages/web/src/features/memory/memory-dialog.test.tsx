import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryDialog } from './memory-dialog'
import { memoryEnabled, setMemoryEnabled } from './settings'

describe('memory dialog', () => {
  afterEach(() => setMemoryEnabled(false))

  it('turns memory on for the whole browser', async () => {
    render(<MemoryDialog onClose={vi.fn()} />)
    await userEvent.click(screen.getByLabelText('Let the assistant remember what you ask it to'))
    expect(memoryEnabled()).toBe(true)
    expect(screen.queryByRole('button', { name: 'Open memory' })).toBeNull()
  })

  it('closes and opens the Memory page', async () => {
    const onClose = vi.fn()
    const onOpenMemory = vi.fn()
    render(<MemoryDialog onClose={onClose} onOpenMemory={onOpenMemory} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open memory' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onOpenMemory).toHaveBeenCalledOnce()
  })
})
