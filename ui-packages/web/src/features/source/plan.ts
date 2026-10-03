import type { ProjectSource } from '../../core/projects'
import type { SaveResult, SourceFile, SourceListing } from './protocol'

export type SnapshotEntry = {
  version: string
  revision: number
  // Pairs a file that moved here with the path it was synced at.
  id?: string
  // An edit made here that a sync left in place, so it still differs from the source.
  kept?: true
}

// What the library held after the last sync: each source file's version, and the revision the
// library gave it, so a later edit in the library can be told apart from the copy that arrived.
// A writable source is also named, so a library is never saved into another folder.
export type SyncSnapshot = {
  version: string
  sourceId?: string
  files: Record<string, SnapshotEntry>
}

type LocalFile = { id: string; path: string; revision: number }

export type SyncPlan = {
  download: SourceFile[]
  remove: string[]
  // Edited here since the last sync, so the library keeps its own copy.
  kept: string[]
}

// What Save sends back to a writable source. A base is the version the copy here started from.
export type SaveChange =
  | { kind: 'write'; id: string; path: string; base: string | null }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'delete'; path: string; base: string }

// Paths in the library are matched without regard to case, as the store matches them.
const byPath = (files: readonly LocalFile[]) =>
  new Map(files.map(file => [file.path.toLowerCase(), file]))

export const planSync = (
  previous: SyncSnapshot | null,
  listing: SourceListing,
  local: readonly LocalFile[],
): SyncPlan => {
  const here = byPath(local)
  const edited = (path: string) => {
    const file = here.get(path.toLowerCase())
    const synced = previous?.files[path]
    return file !== undefined && file.revision !== synced?.revision
  }
  const changed = listing.files.filter(file => previous?.files[file.path]?.version !== file.version)
  const listed = new Set(listing.files.map(file => file.path))
  const gone = Object.keys(previous?.files ?? {}).filter(path => !listed.has(path))
  return {
    download: changed.filter(file => !edited(file.path)),
    remove: gone.flatMap(path => {
      const file = here.get(path.toLowerCase())
      return file && !edited(path) ? [file.id] : []
    }),
    kept: [...changed, ...gone.map(path => ({ path }))].map(file => file.path).filter(edited),
  }
}

// Every listed file the library now holds counts as synced at its current revision. A kept edit
// differs by source: from a read-only one it counts as synced, so once the edit is pushed there
// its next version arrives as usual; to a writable one it stays an edit from the version it
// started at, so Save merges it with what changed on disk rather than overwriting that.
export const snapshotAfter = (
  listing: SourceListing,
  local: readonly LocalFile[],
  {
    kept = [],
    previous = null,
    source = null,
  }: {
    kept?: readonly string[]
    previous?: SyncSnapshot | null
    source?: ProjectSource | null
  } = {},
): SyncSnapshot => {
  const here = byPath(local)
  const keptHere = new Set(kept)
  const sourceId = previous?.sourceId ?? source?.id
  return {
    version: listing.version,
    ...(sourceId ? { sourceId } : {}),
    files: Object.fromEntries(
      listing.files.flatMap(file => {
        const held = here.get(file.path.toLowerCase())
        // A file deleted or moved here stays recorded for a writable source until Save, unless
        // it changed on disk, in which case the sync has brought it back.
        if (!held) {
          const pending = source?.writable ? previous?.files[file.path] : undefined
          return pending && pending.version === file.version ? [[file.path, pending]] : []
        }
        const entry: SnapshotEntry = { version: file.version, revision: held.revision, id: held.id }
        if (!keptHere.has(file.path)) return [[file.path, entry]]
        const started = source?.writable ? previous?.files[file.path] : undefined
        return [[file.path, { ...(started ?? entry), id: held.id, kept: true as const }]]
      }),
    ),
  }
}

const edited = (entry: SnapshotEntry, file: LocalFile) =>
  entry.kept === true || entry.revision !== file.revision

// What changed here since the last sync, worked out from the two states alone, as git status
// does: no edit is recorded as it happens, so none can be missed. Paths decide what was written,
// added and deleted; a deleted path and an added one holding the same file are sent as a move,
// which keeps a large file from being sent again. Missing that pairing still saves the same result.
export const planSave = (snapshot: SyncSnapshot, local: readonly LocalFile[]): SaveChange[] => {
  const here = byPath(local)
  const synced = Object.entries(snapshot.files)
  const syncedPaths = new Set(synced.map(([path]) => path.toLowerCase()))
  const deleted = synced.filter(([path]) => !here.has(path.toLowerCase()))
  const added = local.filter(file => !syncedPaths.has(file.path.toLowerCase()))
  const addedById = new Map(added.map(file => [file.id, file]))
  const moves = deleted.flatMap(([from, entry]) => {
    const file = entry.id === undefined ? undefined : addedById.get(entry.id)
    return file ? [{ from, file, entry }] : []
  })
  const moved = new Set(moves.map(move => move.file.id))
  const present = synced.flatMap(([path, entry]) => {
    const file = here.get(path.toLowerCase())
    return file ? [{ file, entry }] : []
  })
  return [
    ...moves.map(({ from, file }) => ({ kind: 'move' as const, from, to: file.path })),
    ...[...moves, ...present]
      .filter(({ file, entry }) => edited(entry, file))
      .map(({ file, entry }) => ({
        kind: 'write' as const,
        id: file.id,
        path: file.path,
        base: entry.version,
      })),
    ...added
      .filter(file => !moved.has(file.id))
      .map(file => ({ kind: 'write' as const, id: file.id, path: file.path, base: null })),
    ...deleted
      .filter(([, entry]) => entry.id === undefined || !moved.has(entry.id))
      .map(([path, entry]) => ({ kind: 'delete' as const, path, base: entry.version })),
  ]
}

// Files that differ from the source only here: added, edited, moved or deleted since the last
// sync. Without a sync there is nothing to compare with, so every file counts.
export const localChanges = (snapshot: SyncSnapshot | null, local: readonly LocalFile[]) =>
  snapshot ? planSave(snapshot, local).length : local.length

// Save is open only to the folder the library was synced from.
export const saveReady = (snapshot: SyncSnapshot | null, source: ProjectSource) =>
  source.writable === true && snapshot !== null && snapshot.sourceId === source.id

// What was saved counts as synced at the version the source reported, so the next sync does not
// fetch it again. A merged file is marked with no version, so the next sync brings the merge in.
// What was skipped stays a change here.
export const snapshotAfterSave = (
  snapshot: SyncSnapshot,
  results: readonly SaveResult[],
  local: readonly LocalFile[],
): SyncSnapshot => {
  const here = byPath(local)
  // Results apply in the order the source applied them: a moved file's entry follows it before
  // its write lands at the new path.
  const files = new Map(Object.entries(snapshot.files))
  for (const result of results) {
    if (result.kind === 'deleted') files.delete(result.path)
    if (result.kind === 'moved') {
      const entry = files.get(result.from)
      files.delete(result.from)
      if (entry) files.set(result.path, entry)
    }
    const held = here.get(result.path.toLowerCase())
    if ((result.kind === 'written' || result.kind === 'merged') && held) {
      const version = result.kind === 'written' ? result.version : ''
      files.set(result.path, { version, revision: held.revision, id: held.id })
    }
  }
  return { ...snapshot, files: Object.fromEntries(files) }
}
