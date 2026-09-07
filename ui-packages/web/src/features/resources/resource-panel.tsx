import {
  BookOpen,
  FileCode2,
  FileImage,
  FileQuestion,
  FileText,
  PanelLeft,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { formatBytes, type PreviewKind, type StoredFileMetadata } from '../../core/files'
import { DuplicateFilesDialog, RemoveFileDialog } from './file-dialogs'
import type { FileLibrary } from './use-file-library'

type ResourcePanelProps = {
  activeId: string | null
  library: FileLibrary
  onOpen: (id: string) => void
  onRemoved: (id: string) => void
  onClose: () => void
}

const FileKindIcon = ({ kind }: { kind: PreviewKind }) => {
  if (kind === 'image') return <FileImage size={15} />
  if (kind === 'html') return <FileCode2 size={15} />
  if (kind === 'unsupported') return <FileQuestion size={15} />
  return <FileText size={15} />
}

export const ResourcePanel = ({
  activeId,
  library,
  onOpen,
  onRemoved,
  onClose,
}: ResourcePanelProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [removeCandidate, setRemoveCandidate] = useState<StoredFileMetadata | null>(null)

  return (
    <aside className="resource-panel panel-surface" aria-label="Files">
      <header className="panel-header brand-header">
        <span className="brand" title="Gamma Reader">
          <BookOpen size={18} strokeWidth={1.8} /> <span>Gamma Reader</span>
        </span>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Hide files"
          title="Hide files"
        >
          <PanelLeft size={16} />
        </button>
      </header>
      <div className="resource-toolbar">
        <h2>Files</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Add files"
          title="Add files"
          disabled={library.loading || library.importing}
          onClick={() => inputRef.current?.click()}
        >
          <Plus size={16} />
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          aria-label="Choose files"
          multiple
          onChange={event => {
            library.addFiles(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
          }}
        />
      </div>
      {library.status && (
        <div className="file-status" role="alert">
          <span>{library.status.message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss file status"
            onClick={library.dismissStatus}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="resource-list">
        {library.loading ? (
          <p className="resource-state" role="status">
            Loading files…
          </p>
        ) : library.error ? (
          <div className="resource-state error-state">
            <p>{library.error}</p>
            <button type="button" className="text-button" onClick={library.retry}>
              Try again
            </button>
          </div>
        ) : library.files.length === 0 ? (
          <div className="resource-state empty-files">
            <p>Add a document when you are ready to read.</p>
          </div>
        ) : (
          <ul aria-label="Files">
            {library.files.map(file => (
              <li className="resource-row" key={file.id}>
                <button
                  type="button"
                  className={activeId === file.id ? 'resource-item active' : 'resource-item'}
                  onClick={() => onOpen(file.id)}
                  aria-current={activeId === file.id ? 'page' : undefined}
                  title={`${file.name} · ${formatBytes(file.size)}`}
                >
                  <FileKindIcon kind={file.previewKind} />
                  <span>{file.name}</span>
                </button>
                <button
                  type="button"
                  className="icon-button resource-remove"
                  aria-label={`Remove ${file.name} from Files`}
                  title="Remove from Files"
                  onClick={() => setRemoveCandidate(file)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="resource-footer">
        <button
          className="save-button"
          type="button"
          disabled
          title="Saving is not available yet. Reloading clears reading drafts and excerpts."
        >
          <Save size={15} /> <span>Save to folder</span>
        </button>
      </footer>
      {library.duplicateNames.length > 0 && (
        <DuplicateFilesDialog
          names={library.duplicateNames}
          onResolve={library.resolveDuplicates}
        />
      )}
      {removeCandidate && (
        <RemoveFileDialog
          file={removeCandidate}
          onCancel={() => setRemoveCandidate(null)}
          onRemove={() => {
            const id = removeCandidate.id
            void library.removeFile(id).then(removed => {
              if (removed) onRemoved(id)
              setRemoveCandidate(null)
            })
          }}
        />
      )}
    </aside>
  )
}
