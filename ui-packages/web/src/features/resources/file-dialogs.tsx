import { useEffect, useRef } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { DuplicateMode } from '../../data/file-store'

type ModalProps = { children: React.ReactNode; label: string; onCancel: () => void }

const Modal = ({ children, label, onCancel }: ModalProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-label={label}
      onCancel={event => {
        event.preventDefault()
        onCancel()
      }}
    >
      {children}
    </dialog>
  )
}

export const DuplicateFilesDialog = ({
  names,
  onResolve,
}: {
  names: string[]
  onResolve: (mode: DuplicateMode | null) => void
}) => (
  <Modal label="Resolve duplicate files" onCancel={() => onResolve(null)}>
    <h2>{names.length === 1 ? 'A file already exists' : 'Some files already exist'}</h2>
    <p>
      {names.length === 1
        ? `${names[0]} is already in Files.`
        : `${names.length} selected files have names already in Files.`}
    </p>
    <div className="dialog-actions">
      <button type="button" className="text-button" onClick={() => onResolve(null)}>
        Cancel
      </button>
      <button type="button" className="secondary-button" onClick={() => onResolve('keep')}>
        Keep both
      </button>
      <button type="button" className="primary-button" onClick={() => onResolve('replace')}>
        Replace
      </button>
    </div>
  </Modal>
)

export const RemoveFileDialog = ({
  file,
  onCancel,
  onRemove,
}: {
  file: StoredFileMetadata
  onCancel: () => void
  onRemove: () => void
}) => (
  <Modal label={`Remove ${file.name}`} onCancel={onCancel}>
    <h2>Remove from Files?</h2>
    <p>
      This removes the browser copy of <strong>{file.name}</strong>. The original file on your
      computer will not change.
    </p>
    <div className="dialog-actions">
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="danger-button" onClick={onRemove}>
        Remove
      </button>
    </div>
  </Modal>
)

export const ReplaceExportedFilesDialog = ({
  folderName,
  names,
  onCancel,
  onReplace,
}: {
  folderName: string
  names: string[]
  onCancel: () => void
  onReplace: () => void
}) => {
  const visibleNames = names.slice(0, 10)
  return (
    <Modal label="Replace existing files" onCancel={onCancel}>
      <h2>Replace files in {folderName}?</h2>
      <p>{names.length === 1 ? 'This file already exists:' : 'These files already exist:'}</p>
      <ul className="dialog-file-list">
        {visibleNames.map(name => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      {names.length > visibleNames.length && <p>And {names.length - visibleNames.length} more.</p>}
      <p>Replacing updates those files with the copies currently saved in this browser.</p>
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={onReplace}>
          Replace files
        </button>
      </div>
    </Modal>
  )
}
