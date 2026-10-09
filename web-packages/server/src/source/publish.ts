import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { SaveResult } from '@gamma-reader/shared/source-protocol'
import { type Author, git, type Source } from './repository.js'
import { applySave } from './save.js'
import type { SourceScope } from './scope.js'

type Repository = Source & { update: () => Promise<void> }

// The committer of every save, and its author when the sign-in names nobody.
const reader: Author = { name: 'Gamma Reader', email: 'gamma-reader@users.noreply.github.com' }

// The paths a save changed in the clone; what was skipped or handed back changed nothing there.
const changedPaths = (results: readonly SaveResult[]) =>
  results.flatMap(result => {
    if (result.kind === 'skipped' || result.kind === 'conflicted') return []
    return result.kind === 'moved' ? [result.from, result.path] : [result.path]
  })

const message = (paths: readonly string[]) =>
  paths.length === 1
    ? ['-m', `Edit ${paths[0]} in Gamma Reader`]
    : ['-m', `Edit ${paths.length} files in Gamma Reader`, '-m', paths.join('\n')]

// Whether the paths held anything to commit: a file saved as it already was changes nothing.
const commit = async (dir: string, paths: readonly string[], { name, email }: Author) => {
  await git(dir, ['--literal-pathspecs', 'add', '--all', '--', ...paths])
  const staged = (await git(dir, ['diff', '--cached', '--name-only', '-z']))
    .split('\0')
    .filter(Boolean)
  if (staged.length === 0) return false
  await git(dir, [
    '-c',
    `user.name=${reader.name}`,
    '-c',
    `user.email=${reader.email}`,
    'commit',
    '--quiet',
    `--author=${name} <${email}>`,
    ...message(staged),
  ])
  return true
}

const push = (dir: string) => git(dir, ['push', '--quiet', 'origin', 'HEAD'])

// A push the repository refused because it moved on is replayed on its newer commit once.
const pushed = async (dir: string) => {
  try {
    await push(dir)
    return true
  } catch (cause) {
    console.error('The repository refused the save; replaying it on the newer commit', cause)
  }
  try {
    await git(dir, ['pull', '--rebase', '--quiet'])
    await push(dir)
    return true
  } catch (cause) {
    console.error('Unable to push the saved changes', cause)
    return false
  }
}

const rebasing = async (dir: string) => {
  const paths = await git(dir, [
    'rev-parse',
    '--git-path',
    'rebase-merge',
    '--git-path',
    'rebase-apply',
  ])
  const found = await Promise.all(
    paths
      .split('\n')
      .filter(Boolean)
      .map(path =>
        access(join(dir, path)).then(
          () => true,
          (cause: NodeJS.ErrnoException) => {
            if (cause.code === 'ENOENT') return false
            throw cause
          },
        ),
      ),
  )
  return found.some(Boolean)
}

// A save that could not be committed or pushed leaves nothing behind: the clone goes back to the
// repository's commit, and the reader keeps every change to save again.
const undo = async (dir: string, results: readonly SaveResult[]) => {
  if (await rebasing(dir)) await git(dir, ['rebase', '--abort'])
  await git(dir, ['reset', '--hard', '--quiet', '@{upstream}'])
  await git(dir, ['clean', '-d', '--force', '--quiet'])
  return results.map(result =>
    result.kind === 'skipped' || result.kind === 'conflicted'
      ? result
      : { kind: 'skipped' as const, path: result.path, reason: 'failed' as const },
  )
}

// A clone the server also pushes to. Each save starts from the repository's latest commit, is
// committed as the reader who made it, and is pushed at once. Saves and pulls take turns, since
// both move the clone.
export const publishing = (
  repository: Repository,
  { dir, scope }: { dir: string; scope: SourceScope },
): Repository => {
  let queue: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(task: () => Promise<T>) => {
    const turn = queue.then(task)
    queue = Promise.allSettled([turn])
    return turn
  }

  const save: NonNullable<Source['save']> = async (changes, content, author) => {
    await repository.update()
    const results = await applySave(dir, scope, changes, content, 'return-to-reader')
    const paths = changedPaths(results)
    if (paths.length === 0) return results
    try {
      if (!(await commit(dir, paths, author ?? reader))) return results
    } catch (cause) {
      console.error('Unable to commit the saved changes', cause)
      return undo(dir, results)
    }
    return (await pushed(dir)) ? results : undo(dir, results)
  }

  return {
    ...repository,
    update: () => inTurn(repository.update),
    save: (changes, content, author) => inTurn(() => save(changes, content, author)),
  }
}
