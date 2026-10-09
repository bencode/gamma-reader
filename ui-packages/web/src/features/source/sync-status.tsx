import type { SaveResult, SkipReason } from '@gamma-reader/shared/source-protocol'
import * as Popover from '@radix-ui/react-popover'
import { Info, RefreshCw } from 'lucide-react'
import type { SourceScope } from '../../core/projects'
import type { SourceSync, SourceSyncState } from './use-source-sync'

const fileCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`
const changeCount = (count: number) =>
  `${count.toLocaleString()} ${count === 1 ? 'change' : 'changes'}`

// Sync from a read-only source only brings it in. What is added or edited here stays here until
// the source changes the same file, so the line says so whenever there is any.
const LocalChanges = ({ count, name }: { count: number; name: string }) => (
  <>
    <span>{fileCount(count)} changed only in this browser.</span>
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="source-sync-info" aria-label="About changes made here">
          <Info size={12} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="source-sync-note" side="bottom" align="start" sideOffset={4}>
          Files added or edited here stay in this browser. When {name} changes a file, updating
          brings its version in, in place of any edit made here.
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </>
)

const skipped: Record<SkipReason, string> = {
  'deleted-on-disk': 'it was deleted on disk',
  'changed-on-disk': 'it changed on disk',
  missing: 'it is no longer on disk',
  'path-taken': 'another file has its path',
  'cannot-merge': 'it could not be merged with the copy on disk',
  'invalid-path': 'it is outside the source',
  unresolved: 'it still has conflicts marked in it',
  failed: 'saving it failed',
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
    return `${name} leaves out hidden files and folders`
  if (scope.exclude.some(folder => path.startsWith(`${folder}/`)))
    return `${name} leaves out ${listed(scope.exclude)}`
  if (scope.include.length)
    return `${name} saves only ${listed(scope.include)}; move it into one of them`
  return skipped['invalid-path']
}

// What a save did, with what needs the reader's hand named after it: conflicts git marked in a
// file, on disk or here, and changes left unsaved with the reason for each.
const savedMessage = (name: string, results: readonly SaveResult[], scope?: SourceScope) => {
  const done = results.filter(
    result => result.kind !== 'skipped' && result.kind !== 'conflicted',
  ).length
  const clashes = results.flatMap(result => (result.kind === 'conflicted' ? [result] : []))
  const conflicts = results.flatMap(result =>
    result.kind === 'merged' && result.conflicts > 0 ? [result] : [],
  )
  const left = results.flatMap(result => (result.kind === 'skipped' ? [result] : []))
  return [
    `Saved ${changeCount(done)} to ${name}.`,
    ...conflicts.map(
      result =>
        `${result.path} has ${result.conflicts === 1 ? 'a conflict' : `${result.conflicts} conflicts`} marked in the file; resolve it in your editor.`,
    ),
    ...clashes.map(
      result =>
        `${result.path} was not saved: it clashes with a newer edit in ${name}, marked in the file here; resolve it and save again.`,
    ),
    ...left.map(
      result =>
        `${result.path} was not saved: ${
          result.reason === 'invalid-path'
            ? outside(name, result.path, scope)
            : skipped[result.reason]
        }.`,
    ),
  ].join(' ')
}

const message = (name: string, state: SourceSyncState, scope?: SourceScope) => {
  if (state.kind === 'checking') return `Checking ${name}…`
  if (state.kind === 'current') return `${name} is up to date.`
  if (state.kind === 'available')
    return state.replaces.length
      ? `${name} has updates. Updating replaces your edits to ${state.replaces.join(', ')}.`
      : `${name} has updates.`
  if (state.kind === 'syncing')
    return `Updating from ${name}… ${state.done.toLocaleString()} of ${fileCount(state.total)}`
  if (state.kind === 'saving') return `Saving ${changeCount(state.total)} to ${name}…`
  if (state.kind === 'saved') return savedMessage(name, state.results, scope)
  if (state.kind === 'synced')
    return [
      `${name} is up to date.`,
      state.kept.length
        ? `Kept your edits to ${fileCount(state.kept.length)}: ${state.kept.join(', ')}.`
        : '',
      state.replaced.length ? `Replaced your edits to ${state.replaced.join(', ')}.` : '',
      state.refused ? `${fileCount(state.refused)} did not fit the library limits.` : '',
    ]
      .filter(Boolean)
      .join(' ')
  return state.message
}

// What is waiting to be saved to a writable source, or why it cannot be.
const unsaved = (name: string, sync: SourceSync) =>
  sync.saveBlocked
    ? `Changes here cannot be saved: this library was not synced from this ${name} folder. Update, or give the source another name.`
    : `${changeCount(sync.localChanges)} not saved to ${name}.`

// One line under the toolbar: whether the source has updates, and the action that brings them in.
export const SourceSyncStatus = ({
  name,
  scope,
  sync,
}: {
  name: string
  scope?: SourceScope
  sync: SourceSync
}) => {
  const { state, localChanges } = sync
  const actionable = state.kind === 'available' || state.kind === 'failed'
  const pending = localChanges > 0 && !sync.busy
  return (
    <div className="source-sync" role="status">
      <span>
        {message(name, state, scope)}
        {pending && ' '}
        {pending &&
          (sync.writable ? unsaved(name, sync) : <LocalChanges count={localChanges} name={name} />)}
      </span>
      {actionable && (
        <button type="button" className="text-button" onClick={() => void sync.sync()}>
          <RefreshCw size={12} aria-hidden="true" />
          Update
        </button>
      )}
    </div>
  )
}
