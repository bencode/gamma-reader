// The listing a source serves for the reader to sync from. Versions are opaque; each one changes
// when the content does.
export type SourceFile = { path: string; version: string; size: number }
export type SourceListing = { version: string; files: SourceFile[] }

export type SkipReason =
  | 'deleted-on-disk'
  | 'changed-on-disk'
  | 'missing'
  | 'path-taken'
  | 'cannot-merge'
  | 'invalid-path'
  | 'failed'

// What a writable source did with each saved change, in the order it applied them.
export type SaveResult =
  | { kind: 'written'; path: string; version: string }
  | { kind: 'merged'; path: string; version: string; conflicts: number }
  | { kind: 'moved'; from: string; path: string }
  | { kind: 'deleted'; path: string }
  | { kind: 'skipped'; path: string; reason: SkipReason }
