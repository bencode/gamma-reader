import type { SaveResult, SkipReason } from '@gamma-reader/shared/source-protocol'
import type { SourceScope } from '../../core/projects'
import type { SourceSyncState } from './use-source-sync'

// A file the status names, with what happened to it. The status line itself only counts them;
// the files are listed when the reader asks for the details.
export type FileNote = { path: string; note: string }
export type StatusText = { summary: string; files: FileNote[] }

export const fileCount = (count: number) =>
  `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`
export const changeCount = (count: number) =>
  `${count.toLocaleString()} ${count === 1 ? 'change' : 'changes'}`

const skipped: Record<SkipReason, string> = {
  'deleted-on-disk': 'not saved: it was deleted on disk',
  'changed-on-disk': 'not saved: it changed on disk',
  missing: 'not saved: it is no longer on disk',
  'path-taken': 'not saved: another file has its path',
  'cannot-merge': 'not saved: it could not be merged with the copy on disk',
  'invalid-path': 'not saved: it is outside the source',
  unresolved: 'not saved: it still has conflicts marked in it',
  failed: 'not saved: saving it failed',
}

const listed = (folders: readonly string[]) =>
  folders.length < 2
    ? (folders[0] ?? '')
    : `${folders.slice(0, -1).join(', ')} and ${folders.at(-1)}`

// Why a path is outside the source, by the rule that leaves it out, so the reader knows where it
// could go instead. A source that does not say which folders it holds gets the plain reason.
const outside = (name: string, path: string, scope?: SourceScope) => {
  if (!scope) return skipped['invalid-path']
  if (path.split('/').some(segment => segment.startsWith('.')))
    return `not saved: ${name} leaves out hidden files and folders`
  if (scope.exclude.some(folder => path.startsWith(`${folder}/`)))
    return `not saved: ${name} leaves out ${listed(scope.exclude)}`
  if (scope.include.length)
    return `not saved: ${name} saves only ${listed(scope.include)}; move it into one of them`
  return skipped['invalid-path']
}

const conflictCount = (count: number) => (count === 1 ? 'a conflict' : `${count} conflicts`)

// What a result leaves for the reader to do, if anything: a conflict marked in a file, on disk or
// here, or a change that was not saved.
const attention = (name: string, result: SaveResult, scope?: SourceScope): string | null => {
  if (result.kind === 'merged' && result.conflicts > 0)
    return `saved with ${conflictCount(result.conflicts)} marked in the file; resolve it in your editor`
  if (result.kind === 'conflicted')
    return `not saved: it clashes with a newer edit in ${name}, marked in the file here; resolve it and save again`
  if (result.kind === 'skipped')
    return result.reason === 'invalid-path'
      ? outside(name, result.path, scope)
      : skipped[result.reason]
  return null
}

// What a save did: how many changes reached the source, and how many need the reader's hand.
export const savedText = (
  name: string,
  results: readonly SaveResult[],
  scope?: SourceScope,
): StatusText => {
  const saved = results.filter(
    result => result.kind !== 'skipped' && result.kind !== 'conflicted',
  ).length
  const files = results.flatMap(result => {
    const note = attention(name, result, scope)
    return note ? [{ path: result.path, note }] : []
  })
  const need = `${changeCount(files.length)} ${files.length === 1 ? 'needs' : 'need'} attention`
  const summary =
    files.length === 0
      ? `Saved ${changeCount(saved)} to ${name}.`
      : saved === 0
        ? `Nothing was saved to ${name}; ${need}.`
        : `Saved ${changeCount(saved)} to ${name}; ${need}.`
  return { summary, files }
}

const syncedText = (
  name: string,
  { kept, replaced, refused }: { kept: string[]; replaced: string[]; refused: number },
): StatusText => ({
  summary: `${[
    `${name} is up to date`,
    kept.length ? `kept your edits to ${fileCount(kept.length)}` : '',
    replaced.length ? `replaced your edits to ${fileCount(replaced.length)}` : '',
    refused ? `${fileCount(refused)} did not fit the library limits` : '',
  ]
    .filter(Boolean)
    .join('; ')}.`,
  files: [
    ...kept.map(path => ({ path, note: 'your edit is kept' })),
    ...replaced.map(path => ({ path, note: `replaced by the version in ${name}` })),
  ],
})

// The status of the source in one sentence, with the files it names left to the details. What a
// save left for the reader to do is a notice of its own, from savedText; the save brought the
// source in after it, so the status is then up to date.
export const statusText = (name: string, state: SourceSyncState): StatusText => {
  const plain = (summary: string) => ({ summary, files: [] })
  if (state.kind === 'checking') return plain(`Checking ${name}…`)
  if (state.kind === 'current') return plain(`${name} is up to date.`)
  if (state.kind === 'available')
    return state.replaces.length
      ? {
          summary: `${name} has updates; updating replaces your edits to ${fileCount(state.replaces.length)}.`,
          files: state.replaces.map(path => ({ path, note: 'your edit here is replaced' })),
        }
      : plain(`${name} has updates.`)
  if (state.kind === 'syncing')
    return plain(
      `Updating from ${name}… ${state.done.toLocaleString()} of ${fileCount(state.total)}`,
    )
  if (state.kind === 'saving') return plain(`Saving ${changeCount(state.total)} to ${name}…`)
  if (state.kind === 'synced') return syncedText(name, state)
  if (state.kind === 'saved') {
    const saved = savedText(name, state.results)
    return saved.files.length ? plain(`${name} is up to date.`) : saved
  }
  return plain(state.message)
}
