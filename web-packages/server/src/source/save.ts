import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { promisify } from 'node:util'
import { git } from './repository.js'

// A change the reader made since it last synced. A base names the object the reader's copy
// started from, so a file someone else changed meanwhile is merged rather than overwritten.
export type SaveChange =
  | { kind: 'write'; path: string; base: string | null; part: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'delete'; path: string; base: string }

export type SkipReason =
  | 'deleted-on-disk'
  | 'changed-on-disk'
  | 'missing'
  | 'path-taken'
  | 'cannot-merge'
  | 'invalid-path'
  | 'failed'

export type SaveResult =
  | { kind: 'written'; path: string; version: string }
  | { kind: 'merged'; path: string; version: string; conflicts: number }
  | { kind: 'moved'; from: string; path: string }
  | { kind: 'deleted'; path: string }
  | { kind: 'skipped'; path: string; reason: SkipReason }

// The bytes the reader sent for a write, by the part that carries them.
export type SaveContent = (part: string) => Promise<Uint8Array | null>

const run = promisify(execFile)
const maxBuffer = 256 * 1024 * 1024

const skipped = (path: string, reason: SkipReason): SaveResult => ({
  kind: 'skipped',
  path,
  reason,
})

// A change reaches only the folders the source lists, and never git's own.
const allowed = (path: string, include: readonly string[]) =>
  path
    .split('/')
    .every(
      segment => segment !== '' && segment !== '.' && segment !== '..' && segment !== '.git',
    ) &&
  (include.length === 0 || include.some(folder => path.startsWith(`${folder}/`)))

const statOf = (path: string) =>
  lstat(path).then(
    stats => stats,
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === 'ENOENT') return null
      throw cause
    },
  )

// The names alone could still lead out through a linked folder, so the deepest folder that
// exists on the way must really lie in the working tree.
const insideTree = async (dir: string, path: string) => {
  const root = await realpath(dir)
  const within = async (folder: string): Promise<boolean> => {
    try {
      const real = await realpath(folder)
      return real === root || real.startsWith(`${root}${sep}`)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      return folder !== dirname(folder) && within(dirname(folder))
    }
  }
  return within(dirname(join(dir, path)))
}

// Hashed as the listing hashes, without git's filters, so the two versions compare.
const hashOf = async (dir: string, path: string) =>
  (await git(dir, ['hash-object', '--no-filters', '--', path])).trim()

// Stored as it is hashed, so the version handed back can be a later merge's base.
const store = async (dir: string, path: string) =>
  (await git(dir, ['hash-object', '-w', '--no-filters', '--', path])).trim()

const readObject = (dir: string, object: string) =>
  run('git', ['cat-file', 'blob', object], { cwd: dir, encoding: 'buffer', maxBuffer }).then(
    ({ stdout }) => stdout,
    (cause: unknown) => {
      console.error(`Unable to read object ${object}`, cause)
      return null
    },
  )

// Written beside the file and renamed over it, so a reader of the folder never sees half a file.
const writeAtomically = async (path: string, bytes: Uint8Array) => {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${randomUUID()}.gamma-save`)
  await writeFile(temporary, bytes)
  await rename(temporary, path)
}

// A move or delete can leave folders with nothing in them; git does not keep those either.
const pruneEmptyFolders = async (dir: string, path: string) => {
  const segments = path.split('/').slice(0, -1)
  for (let depth = segments.length; depth > 0; depth -= 1) {
    try {
      await rmdir(join(dir, ...segments.slice(0, depth)))
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST' || code === 'ENOENT') return
      throw cause
    }
  }
}

type ExitError = Error & { code: number; stdout: Buffer }

const isExitError = (cause: unknown): cause is ExitError =>
  cause instanceof Error &&
  'code' in cause &&
  typeof cause.code === 'number' &&
  'stdout' in cause &&
  Buffer.isBuffer(cause.stdout)

// git merge-file exits with the number of conflicts it marked, and a negative value (an exit
// status of 128 or more) when it cannot merge at all, as with binary files.
const merge = async (dir: string, path: string, mine: Uint8Array, base: string | null) => {
  const ancestor = base === null ? Buffer.alloc(0) : await readObject(dir, base)
  if (!ancestor) return null
  const scratch = await mkdtemp(join(tmpdir(), 'gamma-reader-merge-'))
  try {
    await writeFile(join(scratch, 'mine'), mine)
    await writeFile(join(scratch, 'base'), ancestor)
    const args = ['merge-file', '-p', '-L', 'reader', '-L', 'base', '-L', 'disk']
    try {
      const { stdout } = await run(
        'git',
        [...args, join(scratch, 'mine'), join(scratch, 'base'), join(dir, path)],
        { cwd: dir, encoding: 'buffer', maxBuffer },
      )
      return { bytes: stdout, conflicts: 0 }
    } catch (cause) {
      if (!isExitError(cause)) throw cause
      return cause.code > 0 && cause.code < 128
        ? { bytes: cause.stdout, conflicts: cause.code }
        : null
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

const write = async (
  dir: string,
  change: Extract<SaveChange, { kind: 'write' }>,
  content: SaveContent,
): Promise<SaveResult> => {
  const { path, base } = change
  const full = join(dir, path)
  const mine = await content(change.part)
  if (!mine) return skipped(path, 'missing')
  const stats = await statOf(full)
  if (stats && !stats.isFile()) return skipped(path, 'path-taken')
  if (!stats && base !== null) return skipped(path, 'deleted-on-disk')
  if (!stats || (await hashOf(dir, path)) === base) {
    await writeAtomically(full, mine)
    return { kind: 'written', path, version: await store(dir, path) }
  }
  const merged = await merge(dir, path, mine, base)
  if (!merged) return skipped(path, 'cannot-merge')
  await writeAtomically(full, merged.bytes)
  return { kind: 'merged', path, version: await store(dir, path), conflicts: merged.conflicts }
}

const move = async (
  dir: string,
  { from, to }: Extract<SaveChange, { kind: 'move' }>,
): Promise<SaveResult> => {
  const source = await statOf(join(dir, from))
  if (!source?.isFile()) return skipped(to, 'missing')
  const target = await statOf(join(dir, to))
  // On a case-insensitive disk, a rename that changes only case finds the same file at both paths.
  if (target && target.ino !== source.ino) return skipped(to, 'path-taken')
  await mkdir(dirname(join(dir, to)), { recursive: true })
  await rename(join(dir, from), join(dir, to))
  await pruneEmptyFolders(dir, from)
  return { kind: 'moved', from, path: to }
}

// A file someone changed since the reader last saw it is kept; the reader learns why.
const remove = async (
  dir: string,
  { path, base }: Extract<SaveChange, { kind: 'delete' }>,
): Promise<SaveResult> => {
  const stats = await statOf(join(dir, path))
  if (!stats) return { kind: 'deleted', path }
  if (!stats.isFile() || (await hashOf(dir, path)) !== base) return skipped(path, 'changed-on-disk')
  await unlink(join(dir, path))
  await pruneEmptyFolders(dir, path)
  return { kind: 'deleted', path }
}

const target = (change: SaveChange) => (change.kind === 'move' ? change.to : change.path)

const apply = (dir: string, change: SaveChange, content: SaveContent) =>
  change.kind === 'move'
    ? move(dir, change)
    : change.kind === 'write'
      ? write(dir, change, content)
      : remove(dir, change)

// Moves go first so that a file moved and then edited is written at its new path; a move that
// did not happen leaves its edit unwritten, rather than merged into whatever holds that path.
// Each change stands alone: one that fails is reported and the rest still apply.
export const applySave = async (
  dir: string,
  include: readonly string[],
  changes: readonly SaveChange[],
  content: SaveContent,
) => {
  const order = { move: 0, write: 1, delete: 2 } as const
  const ordered = [...changes].sort((a, b) => order[a.kind] - order[b.kind])
  const results: SaveResult[] = []
  const unmoved = new Set<string>()
  for (const change of ordered) {
    const paths = change.kind === 'move' ? [change.from, change.to] : [change.path]
    if (change.kind === 'write' && unmoved.has(change.path)) {
      results.push(skipped(change.path, 'missing'))
      continue
    }
    try {
      const inside = await Promise.all(paths.map(path => insideTree(dir, path)))
      const result =
        paths.every(path => allowed(path, include)) && inside.every(Boolean)
          ? await apply(dir, change, content)
          : skipped(target(change), 'invalid-path')
      if (change.kind === 'move' && result.kind === 'skipped') unmoved.add(change.to)
      results.push(result)
    } catch (cause) {
      console.error(`Unable to save ${target(change)}`, cause)
      if (change.kind === 'move') unmoved.add(change.to)
      results.push(skipped(target(change), 'failed'))
    }
  }
  return results
}
