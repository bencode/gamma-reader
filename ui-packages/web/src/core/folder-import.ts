import { baseName, type ImportSource, previewKindFor } from './files'

export const maximumFolderFiles = 5000
export const maximumFolderFileBytes = 1024 * 1024

// A path here starts with the chosen folder's own name, such as 'repo/src/index.ts'.
export type FolderEntry = { path: string; file: File }
// Enough of a file to decide whether it comes in, so a remote listing is chosen from before any
// of it is downloaded.
type FolderListing = { path: string; file: Pick<File, 'size' | 'type'> }
export type FolderSelection<T extends FolderListing = ImportSource> =
  | { status: 'ready'; sources: T[]; skipped: number }
  | { status: 'too-many' }

// Dependencies, build output and tool state are rarely what a reader came to read, and they are
// usually what makes a folder too large to bring in.
const ignoredFolders = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  '__pycache__',
  'venv',
])

export const isIgnoredFolder = (name: string) => name.startsWith('.') || ignoredFolders.has(name)

// The chosen folder itself is never skipped, even when its name starts with a dot.
export const isFolderFileWanted = ({ path, file }: FolderListing) =>
  !path.split('/').slice(1, -1).some(isIgnoredFolder) &&
  !baseName(path).startsWith('.') &&
  file.size <= maximumFolderFileBytes &&
  previewKindFor(path, file.type) !== 'unsupported'

const byPath = (left: FolderListing, right: FolderListing) =>
  left.path.localeCompare(right.path, undefined, { sensitivity: 'base', numeric: true })

// Files are stored in the order they arrive, which is the order they list in, so a folder is
// sorted by path first rather than kept in whatever order the browser walked it.
export const selectFolderFiles = <T extends FolderListing>(
  entries: readonly T[],
): FolderSelection<T> => {
  const sources = entries.filter(isFolderFileWanted).sort(byPath)
  return sources.length > maximumFolderFiles
    ? { status: 'too-many' }
    : { status: 'ready', sources, skipped: entries.length - sources.length }
}
