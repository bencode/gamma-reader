import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'

// The listing the reader syncs from. Versions are opaque; each one changes when the content does.
export type SourceFile = { path: string; version: string; size: number }
export type SourceListing = { version: string; files: SourceFile[] }

// What the routes serve, whichever way the files are kept. A file is read only by a listed path.
export type Source = {
  listing: () => Promise<SourceListing>
  blob: (path: string) => Promise<{ file: SourceFile; stream: ReadableStream<Uint8Array> } | null>
}

const run = promisify(execFile)

export const git = async (cwd: string | undefined, args: string[]) =>
  (await run('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout

// `ls-tree -l -z` writes "<mode> <type> <object> <size>\t<path>" records ended by NUL. Links and
// submodules are left out; only files have content to read.
const parseTree = (output: string): SourceFile[] =>
  output
    .split('\0')
    .filter(Boolean)
    .flatMap(record => {
      const tab = record.indexOf('\t')
      const [mode, type, object, size] = record.slice(0, tab).trim().split(/\s+/)
      return type === 'blob' && mode !== '120000' && object
        ? [{ path: record.slice(tab + 1), version: object, size: Number(size) }]
        : []
    })

const exists = (path: string) =>
  access(path).then(
    () => true,
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === 'ENOENT') return false
      throw cause
    },
  )

export const openRepository = ({
  repo,
  dir,
  include,
}: {
  repo: string
  dir: string
  include: readonly string[]
}) => {
  // A clone lists its commit, and each file its blob.
  let cached: { listing: SourceListing; byPath: Map<string, SourceFile> } | undefined

  // The listing is read from the committed tree, so a pull that is still running never shows a
  // half-updated folder, and it is worked out again only when the commit moves.
  const current = async () => {
    const commit = (await git(dir, ['rev-parse', 'HEAD'])).trim()
    if (cached?.listing.version === commit) return cached
    const files = parseTree(await git(dir, ['ls-tree', '-r', '-l', '-z', commit, '--', ...include]))
    cached = {
      listing: { version: commit, files },
      byPath: new Map(files.map(file => [file.path, file])),
    }
    return cached
  }

  return {
    update: async () => {
      if (await exists(`${dir}/.git`)) await git(dir, ['pull', '--ff-only', '--quiet'])
      else await git(undefined, ['clone', '--quiet', repo, dir])
    },
    listing: async () => (await current()).listing,
    // Streamed, so a large PDF is never held whole in memory. Only a listed path can be read.
    blob: async (path: string) => {
      const file = (await current()).byPath.get(path)
      if (!file) return null
      const child = spawn('git', ['cat-file', 'blob', file.version], {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'inherit'],
      })
      // Without a listener a process that fails to start would bring the whole service down;
      // the request it was serving ends with an empty body instead.
      child.on('error', cause => console.error('Unable to read a source file', cause))
      return { file, stream: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array> }
    },
  }
}
