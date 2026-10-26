import type { SaveResult } from '@gamma-reader/shared/source-protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SourceSyncStatus } from './sync-status'
import type { SourceSync, SourceSyncState } from './use-source-sync'

const show = (state: SourceSyncState, overrides: Partial<SourceSync> = {}, compact = false) => {
  const sync = {
    state,
    localChanges: 0,
    writable: true,
    saveBlocked: false,
    busy: false,
    sync: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as SourceSync
  render(<SourceSyncStatus name="brain2" sync={sync} compact={compact} />)
  return sync
}

const refused: SaveResult[] = ['a.md', 'b.md', 'c.md'].map(path => ({
  kind: 'skipped',
  path,
  reason: 'invalid-path',
}))

describe('the status of a writable source', () => {
  it('compacts a healthy source without confusing it with unsaved changes', () => {
    const sync = show({ kind: 'current' }, {}, true)
    expect(screen.getByRole('status')).toHaveAttribute('title', 'brain2 is up to date.')
    render(<SourceSyncStatus name="other" sync={{ ...sync, localChanges: 1 }} compact />)
    expect(screen.getByText(/1 change not saved to other/)).toBeVisible()
  })

  it('keeps refused sync results and failed updates visible in compact mode', async () => {
    show({ kind: 'synced', kept: [], replaced: [], refused: 2 }, {}, true)
    expect(screen.getByRole('status')).not.toHaveAttribute('title')
    expect(screen.getByText(/2 files did not fit/)).toBeVisible()
    const sync = show({ kind: 'failed', message: 'Offline' }, {}, true)
    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(sync.sync).toHaveBeenCalled()
  })

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

describe('the status of a read-only source', () => {
  it('asks only about the update the reader chose, and never again on its own', async () => {
    const sync = vi.fn(async () => undefined)
    const at = (state: SourceSyncState) =>
      ({
        state,
        localChanges: 1,
        writable: false,
        saveBlocked: false,
        busy: false,
        sync,
      }) as unknown as SourceSync
    const update: SourceSyncState = { kind: 'available', replaces: ['journal/today.md'] }
    const { rerender } = render(<SourceSyncStatus name="brain2" sync={at(update)} />)

    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(screen.getByRole('dialog', { name: 'Replace edits in brain2' })).toBeInTheDocument()

    // A check while the question is open, such as on returning to the tab, ends it; a later update
    // waits for the reader to click again.
    rerender(<SourceSyncStatus name="brain2" sync={at({ kind: 'current' })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<SourceSyncStatus name="brain2" sync={at({ ...update })} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sync).not.toHaveBeenCalled()
  })
})
