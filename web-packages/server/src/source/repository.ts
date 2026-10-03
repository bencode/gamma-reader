import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import type { SaveChange, SaveContent, SaveResult } from './save.js'

// The listing the reader syncs from. Versions are opaque; each one changes when the content does.
export type SourceFile = { path: string; version: string; size: number }
export type SourceListing = { version: string; files: SourceFile[] }

// What the routes serve, whichever way the files are kept. A file is read only by a listed path.
// A source that takes changes back also saves them.
export type Source = {
  listing: () => Promise<SourceListing>
  blob: (path: string) => Promise<{ file: SourceFile; stream: ReadableStream<Uint8Array> } | null>
  save?: (changes: readonly SaveChange[], content: SaveContent) => Promise<SaveResult[]>
}

const run = promisify(execFile)

export const git = async (cwd: string | undefined, args: string[]) =>
  (await run('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })).stdout

// For commands that read their arguments from standard input, such as --stdin-paths.
export const gitWithInput = (cwd: string, args: string[], input: string) =>
  new Promise<string>((done, fail) => {
    const child = execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (cause, stdout) => (cause ? fail(cause) : done(stdout)),
    )
    // A git that exits before reading everything closes the pipe; that fails this call, not
    // the service.
    child.stdin?.on('error', fail)
    child.stdin?.end(input)
  })

// Streamed, so a large PDF is never held whole in memory.
export const streamObject = (cwd: string, object: string) => {
  const child = spawn('git', ['cat-file', 'blob', object], {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  // Without a listener a process that fails to start would bring the whole service down;
  // the request it was serving ends with an empty body instead.
  child.on('error', cause => console.error('Unable to read a source file', cause))
  return Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
}

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

// git records a local repository by the path it was given, joined to where it ran, so local
// paths are compared once resolved; any other address as it is written.
const sameRepository = async (origin: string, repo: string) =>
  (await exists(repo)) ? resolve(origin) === resolve(repo) : origin === repo

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
    // A clone left by another repository is refused rather than served in its place.
    update: async () => {
      if (!(await exists(`${dir}/.git`))) {
        await git(undefined, ['clone', '--quiet', repo, dir])
        return
      }
      const origin = (await git(dir, ['remote', 'get-url', 'origin'])).trim()
      if (!(await sameRepository(origin, repo)))
        throw new Error(
          `${dir} holds a clone of ${origin}, not ${repo}; remove it or clone into another directory`,
        )
      await git(dir, ['pull', '--ff-only', '--quiet'])
    },
    listing: async () => (await current()).listing,
    // Only a listed path can be read.
    blob: async (path: string) => {
      const file = (await current()).byPath.get(path)
      return file ? { file, stream: streamObject(dir, file.version) } : null
    },
  }
}
