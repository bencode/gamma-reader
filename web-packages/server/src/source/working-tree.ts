import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { git, type Source, type SourceFile, type SourceListing } from './repository.js'

// A file that went away since it was listed has nothing to read; any other failure is real.
const statFile = (path: string) =>
  lstat(path).then(
    stats => (stats.isFile() ? stats : null),
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === 'ENOENT') return null
      throw cause
    },
  )

const fileAt = (path: string, stats: { mtimeMs: number; size: number }): SourceFile => ({
  path,
  version: `${stats.mtimeMs}-${stats.size}`,
  size: stats.size,
})

// A working tree someone edits, listed as it is on disk: committed or not, every file git would
// keep, so ignored ones stay out. A version is when the file last changed and how big it is.
export const openWorkingTree = async ({
  dir,
  include,
}: {
  dir: string
  include: readonly string[]
}): Promise<Source> => {
  try {
    await git(dir, ['rev-parse', '--is-inside-work-tree'])
  } catch (cause) {
    throw new Error(`${dir} is not a git working tree`, { cause })
  }
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
    const paths = [...new Set(output.split('\0').filter(Boolean))].sort()
    const files = (
      await Promise.all(
        paths.map(async path => {
          const stats = await statFile(join(dir, path))
          return stats ? [fileAt(path, stats)] : []
        }),
      )
    ).flat()
    listed = new Map(files.map(file => [file.path, file]))
    const version = createHash('sha1')
      .update(files.map(file => `${file.path}\t${file.version}`).join('\n'))
      .digest('hex')
    return { version, files }
  }

  return {
    listing,
    // A path the last listing did not have may be new, so it is listed again before refusing.
    blob: async path => {
      if (!listed.has(path)) await listing()
      if (!listed.has(path)) return null
      const full = join(dir, path)
      const stats = await statFile(full)
      if (!stats) return null
      return {
        file: fileAt(path, stats),
        stream: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
      }
    },
  }
}
