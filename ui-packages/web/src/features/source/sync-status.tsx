import * as Popover from '@radix-ui/react-popover'
import { Info, RefreshCw } from 'lucide-react'
import type { StoredFileMetadata } from '../../core/files'
import type { ProjectSource } from '../../core/projects'
import { useSourceSync } from './use-source-sync'

const fileCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`

// Sync only brings the source in. What is added or edited here stays here, so the line says so
// whenever there is any, and the note says how such a change reaches the source.
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
          Files added or edited here stay in this browser. To share them, save to your {name} folder
          and push.
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </>
)

// One line under the toolbar: whether the source has updates, and the action that brings them in.
export const SourceSyncStatus = ({
  source,
  reload,
  files,
}: {
  source: ProjectSource
  reload: () => Promise<void>
  files: readonly StoredFileMetadata[]
}) => {
  const { state, sync, localChanges } = useSourceSync(source, reload, files)
  const message =
    state.kind === 'checking'
      ? `Checking ${source.name}…`
      : state.kind === 'current'
        ? `${source.name} is up to date.`
        : state.kind === 'available'
          ? `${source.name} has updates.`
          : state.kind === 'syncing'
            ? `Updating from ${source.name}… ${state.done.toLocaleString()} of ${fileCount(state.total)}`
            : state.kind === 'synced'
              ? [
                  `${source.name} is up to date.`,
                  state.kept.length
                    ? `Kept your edits to ${fileCount(state.kept.length)}: ${state.kept.join(', ')}.`
                    : '',
                  state.refused
                    ? `${fileCount(state.refused)} did not fit the library limits.`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : state.message
  const actionable = state.kind === 'available' || state.kind === 'failed'
  return (
    <div className="source-sync" role="status">
      <span>
        {message}
        {localChanges > 0 && ' '}
        {localChanges > 0 && <LocalChanges count={localChanges} name={source.name} />}
      </span>
      {actionable && (
        <button type="button" className="text-button" onClick={() => void sync()}>
          <RefreshCw size={12} aria-hidden="true" />
          Update
        </button>
      )}
    </div>
  )
}
