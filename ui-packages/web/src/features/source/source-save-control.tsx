import { FolderCheck, LoaderCircle, Save } from 'lucide-react'
import type { MouseEvent } from 'react'
import { ConfirmationDialog } from '../../components/confirmation-dialog'
import type { SourceSync } from './use-source-sync'

const saveLabel = (name: string, sync: SourceSync) => {
  if (sync.state.kind === 'saving') return `Saving to ${name}`
  if (sync.saveBlocked) return `Changes cannot be saved to ${name}`
  if (sync.localChanges === 0) return `Everything is saved to ${name}`
  return `Save ${sync.localChanges.toLocaleString()} ${sync.localChanges === 1 ? 'change' : 'changes'} to ${name}`
}

// Save for a library that follows a working tree: it writes what changed here back to the folder,
// in place of saving the library to a folder of the reader's choosing.
export const SourceSaveControl = ({
  name,
  sync,
  className,
  onClick,
}: {
  name: string
  sync: SourceSync
  className: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) => {
  const label = saveLabel(name, sync)
  const dirty = sync.localChanges > 0 && !sync.saveBlocked
  return (
    <button
      type="button"
      className={`icon-button ${className}${dirty ? ' dirty' : ''}`}
      aria-label={label}
      title={label}
      disabled={sync.busy || !dirty}
      onClick={event => {
        onClick?.(event)
        sync.requestSave()
      }}
    >
      {sync.state.kind === 'saving' ? (
        <LoaderCircle className="folder-save-spinner" size={16} aria-hidden="true" />
      ) : dirty ? (
        <Save size={16} aria-hidden="true" />
      ) : (
        <FolderCheck size={16} aria-hidden="true" />
      )}
    </button>
  )
}

// Deleting on disk is the one change Save asks about first.
export const SaveDeletionsDialog = ({ name, sync }: { name: string; sync: SourceSync }) => {
  const paths = sync.confirming ?? []
  const visible = paths.slice(0, 10)
  return (
    <ConfirmationDialog label={`Delete files in ${name}`} onCancel={sync.cancelSave}>
      <h2>Delete files in {name}?</h2>
      <p>
        {paths.length === 1
          ? 'This file was removed here, so saving deletes it from disk:'
          : 'These files were removed here, so saving deletes them from disk:'}
      </p>
      <ul className="dialog-file-list">
        {visible.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>
      {paths.length > visible.length && <p>And {paths.length - visible.length} more.</p>}
      <p>A file someone changed on disk since the last update is kept.</p>
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={sync.cancelSave}>
          Cancel
        </button>
        <button type="button" className="danger-button" onClick={sync.confirmSave}>
          Save and delete
        </button>
      </div>
    </ConfirmationDialog>
  )
}
