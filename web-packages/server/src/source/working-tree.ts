import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  git,
  gitWithInput,
  type Source,
  type SourceFile,
  type SourceListing,
  streamObject,
} from './repository.js'
import { applySave } from './save.js'
import { inScope } from './scope.js'

// A file that went away since it was listed has nothing to read; any other failure is real.
const statFile = (path: string) =>
  lstat(path).then(
    stats => (stats.isFile() ? stats : null),
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === 'ENOENT') return null
      throw cause
    },
  )

// What git itself checks to tell whether a file changed. The change time moves on every write
// and cannot be set back, so an edit that keeps the size and restores the modified time still
// shows, as does a file replaced by a rename.
const stampOf = (stats: Stats) => `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}:${stats.ino}`

// --stdin-paths reads one path a line and unquotes a line that starts with a quote.
const hashable = (path: string) => !path.includes('\n') && !path.startsWith('"')

// Each file is hashed into the object store as it is on disk, without git's filters, so what is
// served is exactly the file and every version listed can later be read back as a merge base.
const hashFiles = async (dir: string, paths: readonly string[]) => {
  if (paths.length === 0) return []
  const lines = (list: readonly string[]) => list.map(line => `${line}\n`).join('')
  const objects = (
    await gitWithInput(dir, ['hash-object', '-w', '--no-filters', '--stdin-paths'], lines(paths))
  )
    .trim()
    .split('\n')
  const sizes = (
    await gitWithInput(dir, ['cat-file', '--batch-check=%(objectsize)'], lines(objects))
  )
    .trim()
    .split('\n')
    .map(Number)
  return objects.map((version, index) => ({ version, size: sizes[index] ?? 0 }))
}

// A working tree someone edits, listed as it is on disk: committed or not, every file git would
// keep, so ignored ones stay out. A version is the git object of the file's content, worked out
// again only for files whose stat changed. The reader can save its changes back.
export const openWorkingTree = async ({
  dir,
  include,
  exclude = [],
}: {
  dir: string
  include: readonly string[]
  exclude?: readonly string[]
}): Promise<Source> => {
  const scope = { include, exclude }
  try {
    await git(dir, ['rev-parse', '--is-inside-work-tree'])
  } catch (cause) {
    throw new Error(`${dir} is not a git working tree`, { cause })
  }
  let hashed = new Map<string, { stamp: string; file: SourceFile }>()
  let listed = new Map<string, SourceFile>()

  const listing = async (): Promise<SourceListing> => {
    const output = await git(dir, [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...include,
    ])
    // During a merge a conflicted path is listed once per stage.
    const paths = [...new Set(output.split('\0').filter(Boolean))]
      .filter(path => hashable(path) && inScope(path, scope))
      .sort()
    const present = (
      await Promise.all(
        paths.map(async path => {
          const stats = await statFile(join(dir, path))
          return stats ? [{ path, stamp: stampOf(stats) }] : []
        }),
      )
    ).flat()
    const stale = present.filter(({ path, stamp }) => hashed.get(path)?.stamp !== stamp)
    const fresh = await hashFiles(
      dir,
      stale.map(({ path }) => path),
    )
    const updated = new Map(
      stale.map(({ path, stamp }, index) => [
        path,
        { stamp, file: { path, ...(fresh[index] as { version: string; size: number }) } },
      ]),
    )
    hashed = new Map(
      present.flatMap(({ path }) => {
        const entry = updated.get(path) ?? hashed.get(path)
        return entry ? [[path, entry] as const] : []
      }),
    )
    const files = [...hashed.values()].map(entry => entry.file)
    listed = new Map(files.map(file => [file.path, file]))
    const version = createHash('sha1')
      .update(files.map(file => `${file.path}\t${file.version}`).join('\n'))
      .digest('hex')
    return { version, files }
  }

  return {
    listing,
    // A path the last listing did not have may be new, so it is listed again before refusing.
    // The content served is the listed version's, so the two always agree.
    blob: async path => {
      if (!listed.has(path)) await listing()
      const file = listed.get(path)
      return file ? { file, stream: streamObject(dir, file.version) } : null
    },
    save: (changes, content) => applySave(dir, scope, changes, content),
  }
}
