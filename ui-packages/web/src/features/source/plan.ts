import type { SourceFile, SourceListing } from './protocol'

// What the library held after the last sync: each source file's version, and the revision the
// library gave it, so a later edit in the library can be told apart from the copy that arrived.
export type SyncSnapshot = {
  version: string
  files: Record<string, { version: string; revision: number }>
}

type LocalFile = { id: string; path: string; revision: number }

export type SyncPlan = {
  download: SourceFile[]
  remove: string[]
  // Edited here since the last sync, so the library keeps its own copy.
  kept: string[]
}

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

// Every listed file the library now holds counts as synced at its current revision, including a
// kept edit: once that edit is pushed to the source, its next version arrives as usual.
export const snapshotAfter = (
  listing: SourceListing,
  local: readonly LocalFile[],
): SyncSnapshot => {
  const here = byPath(local)
  return {
    version: listing.version,
    files: Object.fromEntries(
      listing.files.flatMap(file => {
        const held = here.get(file.path.toLowerCase())
        return held ? [[file.path, { version: file.version, revision: held.revision }]] : []
      }),
    ),
  }
}
