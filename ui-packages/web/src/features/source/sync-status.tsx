import type { SaveResult } from '@gamma-reader/shared/source-protocol'
import * as Popover from '@radix-ui/react-popover'
import { Info, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import type { SourceScope } from '../../core/projects'
import { changeCount, type FileNote, fileCount, savedText, statusText } from './sync-text'
import type { SourceSync } from './use-source-sync'

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

// The files a status names, listed only when asked for, so the line stays one sentence.
const Details = ({ files }: { files: readonly FileNote[] }) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className="text-button">
        Details
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="source-sync-note source-sync-files"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <ul>
          {files.map(file => (
            <li key={file.path}>
              <strong>{file.path}</strong>
              <span>{file.note}</span>
            </li>
          ))}
        </ul>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
)

// What is waiting to be saved to a writable source, or why it cannot be.
const unsaved = (name: string, sync: SourceSync) =>
  sync.saveBlocked
    ? `Not synced from this ${name} folder yet, so changes here cannot be saved.`
    : `${changeCount(sync.localChanges)} not saved to ${name}.`

// One line under the toolbar: whether the source has updates, and the action that brings them in.
// What a save left for the reader to do is a notice below it, like the library's own, until the
// reader dismisses it or the next status replaces it.
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
  const [dismissed, setDismissed] = useState<readonly SaveResult[] | null>(null)
  const status = statusText(name, state)
  const saved = state.kind === 'saved' ? savedText(name, state.results, scope) : null
  const notice =
    state.kind === 'saved' && state.results !== dismissed && (saved?.files.length ?? 0) > 0
  const actionable = state.kind === 'available' || state.kind === 'failed' || sync.saveBlocked
  const pending = localChanges > 0 && !sync.busy && !notice
  return (
    <>
      <div className="source-sync" role="status">
        <span>
          {status.summary}
          {pending && ' '}
          {pending &&
            (sync.writable ? (
              unsaved(name, sync)
            ) : (
              <LocalChanges count={localChanges} name={name} />
            ))}
        </span>
        {status.files.length > 0 && <Details files={status.files} />}
        {actionable && (
          <button
            type="button"
            className="text-button"
            disabled={sync.busy}
            onClick={() => void sync.sync()}
          >
            <RefreshCw size={12} aria-hidden="true" />
            Update
          </button>
        )}
      </div>
      {notice && saved && (
        <div className="file-status source-save-notice" role="alert">
          <span>{saved.summary}</span>
          <Details files={saved.files} />
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss save result"
            onClick={() => setDismissed(state.results)}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  )
}
