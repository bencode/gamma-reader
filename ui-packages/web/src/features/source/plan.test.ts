import { describe, expect, it } from 'vitest'
import { planSync, type SyncSnapshot, snapshotAfter } from './plan'

const listing = (files: Record<string, string>) => ({
  version: Object.values(files).join('-'),
  files: Object.entries(files).map(([path, version]) => ({ path, version, size: 1 })),
})

const previous: SyncSnapshot = {
  version: 'old',
  files: {
    'notes/same.md': { version: 'a', revision: 1 },
    'notes/changed.md': { version: 'b', revision: 1 },
    'notes/edited.md': { version: 'c', revision: 1 },
    'notes/gone.md': { version: 'd', revision: 1 },
    'notes/gone-edited.md': { version: 'e', revision: 1 },
  },
}
const local = [
  { id: 'same', path: 'notes/same.md', revision: 1 },
  { id: 'changed', path: 'notes/changed.md', revision: 1 },
  { id: 'edited', path: 'notes/edited.md', revision: 2 },
  { id: 'gone', path: 'notes/gone.md', revision: 1 },
  { id: 'gone-edited', path: 'notes/gone-edited.md', revision: 3 },
  { id: 'mine', path: 'notes/mine.md', revision: 1 },
]

describe('source sync plan', () => {
  it('brings in changes, removes what left the source and keeps edits made here', () => {
    const next = listing({
      'notes/same.md': 'a',
      'notes/changed.md': 'b2',
      'notes/edited.md': 'c2',
      'notes/new.md': 'f',
    })

    const plan = planSync(previous, next, local)

    expect(plan.download.map(file => file.path)).toEqual(['notes/changed.md', 'notes/new.md'])
    expect(plan.remove).toEqual(['gone'])
    expect(plan.kept).toEqual(['notes/edited.md', 'notes/gone-edited.md'])
  })

  it('adds everything to an empty library and keeps a file it already holds', () => {
    const plan = planSync(null, listing({ 'a.md': '1', 'notes/mine.md': '2' }), local)

    expect(plan.download.map(file => file.path)).toEqual(['a.md'])
    expect(plan.kept).toEqual(['notes/mine.md'])
  })

  it('records kept edits as synced so the next version of them arrives', () => {
    const next = listing({ 'notes/edited.md': 'c2' })
    const snapshot = snapshotAfter(next, local)

    expect(snapshot).toEqual({
      version: next.version,
      files: { 'notes/edited.md': { version: 'c2', revision: 2 } },
    })
    expect(planSync(snapshot, listing({ 'notes/edited.md': 'c3' }), local).download).toHaveLength(1)
  })
})
