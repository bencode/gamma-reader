import { describe, expect, it } from 'vitest'
import {
  localChanges,
  planSave,
  planSync,
  type SyncSnapshot,
  saveReady,
  snapshotAfter,
  snapshotAfterSave,
} from './plan'

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

describe('syncing from a read-only source', () => {
  it('brings in what changed there, over edits made here, and leaves the rest as it is here', () => {
    const next = listing({
      'notes/same.md': 'a',
      'notes/changed.md': 'b2',
      'notes/edited.md': 'c2',
      'notes/new.md': 'f',
    })

    const plan = planSync(previous, next, local)

    expect(plan.download.map(file => file.path)).toEqual([
      'notes/changed.md',
      'notes/edited.md',
      'notes/new.md',
    ])
    expect(plan.replaced).toEqual(['notes/edited.md'])
    expect(plan.remove).toEqual(['gone'])
    expect(plan.kept).toEqual(['notes/gone-edited.md'])
  })

  it('adds everything to an empty library, replacing a file it holds at a listed path', () => {
    const plan = planSync(null, listing({ 'a.md': '1', 'notes/mine.md': '2' }), local)

    expect(plan.download.map(file => file.path)).toEqual(['a.md', 'notes/mine.md'])
    expect(plan.replaced).toEqual(['notes/mine.md'])
  })

  it('keeps an edit and a deletion the source has not changed, through later syncs', () => {
    // same.md is edited here and gone.md deleted here; only changed.md changes at the source.
    const here = [
      { id: 'same', path: 'notes/same.md', revision: 3 },
      { id: 'changed', path: 'notes/changed.md', revision: 1 },
    ]
    const first = listing({ 'notes/same.md': 'a', 'notes/changed.md': 'b2', 'notes/gone.md': 'd' })
    const plan = planSync(previous, first, here)
    expect(plan.download.map(file => file.path)).toEqual(['notes/changed.md'])
    expect(plan.replaced).toEqual([])

    const synced = [
      here[0] as (typeof here)[number],
      { ...(here[1] as (typeof here)[number]), revision: 2 },
    ]
    const after = snapshotAfter(first, synced, { kept: plan.kept, previous })
    expect(planSync(after, first, synced).download).toEqual([])
    expect(localChanges(after, synced)).toBe(2)
    const next = listing({ 'notes/same.md': 'a2', 'notes/changed.md': 'b2', 'notes/gone.md': 'd2' })
    const later = planSync(after, next, synced)
    expect(later.download.map(file => file.path)).toEqual(['notes/same.md', 'notes/gone.md'])
    expect(later.replaced).toEqual(['notes/same.md'])
  })

  it('counts the files that differ from the source only here', () => {
    const synced: SyncSnapshot = {
      version: 'v1',
      files: {
        'notes/same.md': { version: 'a', revision: 1 },
        'notes/edited.md': { version: 'b', revision: 1 },
        'notes/kept.md': { version: 'c', revision: 2, kept: true },
      },
    }
    const here = [
      { id: 'same', path: 'Notes/same.md', revision: 1 },
      { id: 'edited', path: 'notes/edited.md', revision: 2 },
      { id: 'kept', path: 'notes/kept.md', revision: 2 },
      { id: 'mine', path: 'notes/mine.md', revision: 1 },
    ]

    expect(localChanges(synced, here)).toBe(3)
    expect(localChanges(null, here)).toBe(4)
    expect(
      snapshotAfter(listing({ 'notes/kept.md': 'c' }), here, { kept: ['notes/kept.md'] }).files,
    ).toEqual({ 'notes/kept.md': { version: 'c', revision: 2, id: 'kept', kept: true } })
  })
})

const folder = { name: 'notes', url: '/api/library', writable: true, id: 'folder' }

// The library as last synced from a working tree, and as it is now after work here.
const synced: SyncSnapshot = {
  version: 'v1',
  sourceId: 'folder',
  files: {
    'notes/same.md': { version: 'a', revision: 1, id: 'same' },
    'notes/edited.md': { version: 'b', revision: 1, id: 'edited' },
    'notes/old.md': { version: 'c', revision: 1, id: 'old' },
    'papers/x.pdf': { version: 'd', revision: 1, id: 'pdf' },
    'notes/renamed.md': { version: 'e', revision: 1, id: 'renamed' },
  },
}
const now = [
  { id: 'same', path: 'notes/same.md', revision: 1 },
  { id: 'edited', path: 'notes/edited.md', revision: 2 },
  { id: 'pdf', path: 'archive/x.pdf', revision: 1 },
  { id: 'renamed', path: 'notes/kept/renamed.md', revision: 4 },
  { id: 'new', path: 'notes/new.md', revision: 1 },
]

describe('saving to a writable source', () => {
  it('works out every change from the two states, and pairs a moved file', () => {
    expect(planSave(synced, now)).toEqual([
      { kind: 'move', from: 'papers/x.pdf', to: 'archive/x.pdf' },
      { kind: 'move', from: 'notes/renamed.md', to: 'notes/kept/renamed.md' },
      { kind: 'write', id: 'renamed', path: 'notes/kept/renamed.md', base: 'e' },
      { kind: 'write', id: 'edited', path: 'notes/edited.md', base: 'b' },
      { kind: 'write', id: 'new', path: 'notes/new.md', base: null },
      { kind: 'delete', path: 'notes/old.md', base: 'c' },
    ])
    expect(localChanges(synced, now)).toBe(6)
  })

  it('still saves the same result when a moved file cannot be paired', () => {
    const { id: _id, ...unpaired } = synced.files['papers/x.pdf'] as SyncSnapshot['files'][string]
    const legacy = { ...synced, files: { ...synced.files, 'papers/x.pdf': unpaired } }

    expect(planSave(legacy, now)).toEqual(
      expect.arrayContaining([
        { kind: 'write', id: 'pdf', path: 'archive/x.pdf', base: null },
        { kind: 'delete', path: 'papers/x.pdf', base: 'd' },
      ]),
    )
  })

  it('leaves nothing to save once the results are recorded, and fetches only the merge', () => {
    const after = snapshotAfterSave(
      synced,
      [
        { kind: 'moved', from: 'papers/x.pdf', path: 'archive/x.pdf' },
        { kind: 'moved', from: 'notes/renamed.md', path: 'notes/kept/renamed.md' },
        { kind: 'written', path: 'notes/kept/renamed.md', version: 'e2' },
        { kind: 'merged', path: 'notes/edited.md', version: 'b2', conflicts: 1 },
        { kind: 'written', path: 'notes/new.md', version: 'f' },
        { kind: 'deleted', path: 'notes/old.md' },
      ],
      now,
    )

    expect(localChanges(after, now)).toBe(0)
    const disk = listing({
      'notes/same.md': 'a',
      'notes/edited.md': 'b2',
      'archive/x.pdf': 'd',
      'notes/kept/renamed.md': 'e2',
      'notes/new.md': 'f',
    })
    expect(planSync(after, disk, now, true).download.map(file => file.path)).toEqual([
      'notes/edited.md',
    ])
  })

  it('keeps a skipped change to save again', () => {
    const after = snapshotAfterSave(
      synced,
      [{ kind: 'skipped', path: 'notes/old.md', reason: 'changed-on-disk' }],
      now,
    )

    expect(planSave(after, now)).toContainEqual({ kind: 'delete', path: 'notes/old.md', base: 'c' })
  })

  it('keeps the version an edit started from while the file changes on disk', () => {
    const disk = listing({ 'notes/same.md': 'a', 'notes/edited.md': 'b2' })
    const plan = planSync(synced, disk, now, true)
    const after = snapshotAfter(disk, now, { kept: plan.kept, previous: synced, source: folder })

    expect(plan.kept).toEqual(['notes/edited.md'])
    expect(planSave(after, now)).toContainEqual({
      kind: 'write',
      id: 'edited',
      path: 'notes/edited.md',
      base: 'b',
    })
    const later = listing({ 'notes/same.md': 'a', 'notes/edited.md': 'b3' })
    expect(planSync(after, later, now, true).download).toEqual([])
  })

  it('still saves every change after a sync brings in an edit made on disk', () => {
    const disk = listing({
      'notes/same.md': 'a',
      'notes/edited.md': 'b2',
      'notes/old.md': 'c',
      'papers/x.pdf': 'd',
      'notes/renamed.md': 'e',
    })
    const plan = planSync(synced, disk, now, true)
    const after = snapshotAfter(disk, now, { kept: plan.kept, previous: synced, source: folder })

    expect(planSave(after, now)).toEqual(planSave(synced, now))
  })

  it('still saves an edit to a file unchanged on disk after a sync brings in another', () => {
    const disk = listing({ 'notes/same.md': 'a2', 'notes/edited.md': 'b' })
    const here = [{ id: 'edited', path: 'notes/edited.md', revision: 2 }]
    const plan = planSync(synced, disk, here, true)
    const after = snapshotAfter(
      disk,
      [...here, { id: 'same', path: 'notes/same.md', revision: 2 }],
      {
        kept: plan.kept,
        previous: synced,
        source: folder,
      },
    )

    expect(planSave(after, here)).toContainEqual({
      kind: 'write',
      id: 'edited',
      path: 'notes/edited.md',
      base: 'b',
    })
  })

  it('saves only to the folder the library was synced from', () => {
    expect(saveReady(synced, folder)).toBe(true)
    expect(saveReady(synced, { ...folder, id: 'another' })).toBe(false)
    expect(saveReady(null, folder)).toBe(false)
    expect(
      snapshotAfter(listing({}), [], { previous: synced, source: { ...folder, id: 'another' } })
        .sourceId,
    ).toBe('folder')
  })
})
