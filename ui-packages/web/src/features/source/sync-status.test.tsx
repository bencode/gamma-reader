import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SourceScope } from '../../core/projects'
import { SourceSyncStatus } from './sync-status'
import type { SourceSync } from './use-source-sync'

// A save to brain2 that left the given paths out of the source.
const refused = (paths: string[], scope?: SourceScope) => {
  const sync = {
    state: {
      kind: 'saved',
      results: paths.map(path => ({ kind: 'skipped', path, reason: 'invalid-path' })),
    },
    localChanges: 0,
    writable: true,
    saveBlocked: false,
    busy: false,
  } as unknown as SourceSync
  render(<SourceSyncStatus name="brain2" scope={scope} sync={sync} />)
  return screen.getByRole('status').textContent
}

describe('a save the source refused', () => {
  it('names the rule that left each file out, so the reader knows where it could go', () => {
    expect(
      refused(['sun/orbit.p5.js'], { include: ['knowledge', 'journal', 'projects'], exclude: [] }),
    ).toContain(
      'sun/orbit.p5.js was not saved: brain2 saves only knowledge, journal and projects; move it into one of them.',
    )
  })

  it('says which folders and files a whole repository leaves out', () => {
    const text = refused(['meta/x.md', '.claude/y.md'], { include: [], exclude: ['meta', 'asar'] })

    expect(text).toContain('meta/x.md was not saved: brain2 leaves out meta and asar.')
    expect(text).toContain(
      '.claude/y.md was not saved: brain2 leaves out hidden files and folders.',
    )
  })

  it('keeps the plain reason for a source that does not say what it holds', () => {
    expect(refused(['x.md'])).toContain('x.md was not saved: it is outside the source.')
  })
})
