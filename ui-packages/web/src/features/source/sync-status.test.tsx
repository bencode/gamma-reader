import type { SaveResult } from '@gamma-reader/shared/source-protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SourceSyncStatus } from './sync-status'
import type { SourceSync, SourceSyncState } from './use-source-sync'

const show = (state: SourceSyncState, overrides: Partial<SourceSync> = {}) => {
  const sync = {
    state,
    localChanges: 0,
    writable: true,
    saveBlocked: false,
    busy: false,
    sync: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as SourceSync
  render(<SourceSyncStatus name="brain2" sync={sync} />)
  return sync
}

const refused: SaveResult[] = ['a.md', 'b.md', 'c.md'].map(path => ({
  kind: 'skipped',
  path,
  reason: 'invalid-path',
}))

describe('the status of a writable source', () => {
  it('sums up a save in one notice and lists each file only when asked', async () => {
    show({ kind: 'saved', results: refused }, { localChanges: 3 })

    const notice = screen.getByRole('alert')
    expect(notice.textContent).toContain('Nothing was saved to brain2; 3 changes need attention.')
    expect(notice.textContent).not.toContain('a.md')
    expect(screen.getByRole('status').textContent).toBe('brain2 is up to date.')

    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('a.md')).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss save result' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('3 changes not saved to brain2.')
  })

  it('offers Update when changes here cannot be saved until the library is synced', async () => {
    const sync = show({ kind: 'current' }, { localChanges: 2, saveBlocked: true })

    expect(screen.getByRole('status').textContent).toContain(
      'Not synced from this brain2 folder yet',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(sync.sync).toHaveBeenCalled()
  })
})
