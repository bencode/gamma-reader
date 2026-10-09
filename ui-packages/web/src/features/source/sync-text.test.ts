import type { SaveResult } from '@gamma-reader/shared/source-protocol'
import { describe, expect, it } from 'vitest'
import { savedText, statusText } from './sync-text'

const outside = (path: string): SaveResult => ({ kind: 'skipped', path, reason: 'invalid-path' })

describe('what a save says', () => {
  it('counts what was saved and what needs attention, and names each file only in the details', () => {
    const text = savedText('brain2', [
      { kind: 'written', path: 'notes/a.md', version: 'v1' },
      { kind: 'merged', path: 'notes/b.md', version: 'v3', conflicts: 2 },
      { kind: 'conflicted', path: 'notes/c.md', version: 'v2', text: '' },
      outside('d.md'),
    ])

    expect(text.summary).toBe('Saved 2 changes to brain2; 3 changes need attention.')
    expect(text.files.map(file => file.path)).toEqual(['notes/b.md', 'notes/c.md', 'd.md'])
    expect(text.files[0]?.note).toBe(
      'saved with 2 conflicts marked in the file; resolve it in your editor',
    )
  })

  it('says plainly when nothing was saved, and stays quiet about files when all were', () => {
    expect(savedText('brain2', [outside('d.md')]).summary).toBe(
      'Nothing was saved to brain2; 1 change needs attention.',
    )
    const all = savedText('brain2', [{ kind: 'written', path: 'a.md', version: 'v1' }])
    expect(all).toEqual({ summary: 'Saved 1 change to brain2.', files: [] })
  })

  it('names the rule that left a file out, so the reader knows where it could go', () => {
    const note = (path: string, include: string[], exclude: string[]) =>
      savedText('brain2', [outside(path)], { include, exclude }).files[0]?.note

    expect(note('sun/orbit.p5.js', ['knowledge', 'journal', 'projects'], [])).toBe(
      'not saved: brain2 saves only knowledge, journal and projects; move it into one of them',
    )
    expect(note('meta/x.md', [], ['meta', 'asar'])).toBe(
      'not saved: brain2 leaves out meta and asar',
    )
    expect(note('.claude/y.md', [], [])).toBe(
      'not saved: brain2 leaves out hidden files and folders',
    )
    expect(savedText('brain2', [outside('x.md')]).files[0]?.note).toBe(
      'not saved: it is outside the source',
    )
  })
})

describe('what the status line says', () => {
  it('counts the files a sync kept or replaced, and lists them in the details', () => {
    const text = statusText('brain2', {
      kind: 'synced',
      kept: ['a.md', 'b.md'],
      replaced: ['c.md'],
      refused: 0,
    })

    expect(text.summary).toBe(
      'brain2 is up to date; kept your edits to 2 files; replaced your edits to 1 file.',
    )
    expect(text.files).toHaveLength(3)
  })

  it('leaves what a save needs to the notice, since the save brought the source in after it', () => {
    expect(statusText('brain2', { kind: 'saved', results: [outside('d.md')] })).toEqual({
      summary: 'brain2 is up to date.',
      files: [],
    })
  })
})
