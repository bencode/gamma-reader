import { RefreshCw } from 'lucide-react'
import type { ProjectSource } from '../../core/projects'
import { useSourceSync } from './use-source-sync'

const fileCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'file' : 'files'}`

// One line under the toolbar: whether the source has changed, and the action that brings it in.
export const SourceSyncStatus = ({
  source,
  reload,
}: {
  source: ProjectSource
  reload: () => Promise<void>
}) => {
  const { state, sync } = useSourceSync(source, reload)
  const message =
    state.kind === 'checking'
      ? `Checking ${source.name}…`
      : state.kind === 'current'
        ? `${source.name} is up to date.`
        : state.kind === 'available'
          ? `${source.name} has changes.`
          : state.kind === 'syncing'
            ? `Syncing ${source.name}… ${state.done.toLocaleString()} of ${fileCount(state.total)}`
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
      <span>{message}</span>
      {actionable && (
        <button type="button" className="text-button" onClick={() => void sync()}>
          <RefreshCw size={12} aria-hidden="true" />
          Sync
        </button>
      )}
    </div>
  )
}
