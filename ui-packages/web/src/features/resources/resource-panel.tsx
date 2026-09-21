import {
  BookOpen,
  FileCode2,
  FileDown,
  FileImage,
  FileQuestion,
  FileText,
  LoaderCircle,
  PanelLeft,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import { formatBytes, type PreviewKind, type StoredFileMetadata } from '../../core/files'
import { useSourceDrafts } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'
import { DuplicateFilesDialog, RemoveFileDialog } from './file-dialogs'
import { FolderExportControl } from './folder-export-control'
import type { FileExportController } from './use-file-export'
import type { FileLibrary } from './use-file-library'

type ResourcePanelProps = {
  activeId: string | null
  library: FileLibrary
  exporter: FileExportController
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

const ResourceList = ({
  files,
  label,
  activeId,
  onOpen,
  onRemove,
  onSaveAs,
  savingFileId,
  exportBusy,
}: {
  files: StoredFileMetadata[]
  label: 'Files' | 'Attachments'
  activeId: string | null
  onOpen: (id: string) => void
  onRemove: (file: StoredFileMetadata) => void
  onSaveAs: (id: string) => void
  savingFileId: string | null
  exportBusy: boolean
}) => (
  <ul aria-label={label}>
    {files.map(file => (
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
        <span className="resource-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Save ${file.name} as`}
            title="Save as…"
            disabled={exportBusy}
            onClick={() => onSaveAs(file.id)}
          >
            {savingFileId === file.id ? (
              <LoaderCircle className="folder-save-spinner" size={13} />
            ) : (
              <FileDown size={13} />
            )}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${file.name} from ${label}`}
            title={`Remove from ${label}`}
            onClick={() => onRemove(file)}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </li>
    ))}
  </ul>
)

export const ResourcePanel = ({
  activeId,
  library,
  exporter,
  onOpen,
  onRemoved,
  onClose,
}: ResourcePanelProps) => {
  const drafts = useSourceDrafts()
  const inputRef = useRef<HTMLInputElement>(null)
  const [removeCandidate, setRemoveCandidate] = useState<StoredFileMetadata | null>(null)
  const [dropping, setDropping] = useState(false)
  const files = library.files.filter(file => (file.collection ?? 'files') === 'files')
  const attachments = library.files.filter(file => file.collection === 'attachments')

  // A dropped folder arrives as a File that cannot be read, and importing it would leave a
  // broken entry in the library. The Add files button cannot reach one at all.
  const droppedFiles = (transfer: DataTransfer) => {
    const directories = new Set(
      Array.from(transfer.items)
        .map(item => item.webkitGetAsEntry?.())
        .flatMap(entry => (entry?.isDirectory ? [entry.name] : [])),
    )
    return Array.from(transfer.files).filter(file => !directories.has(file.name))
  }

  const dropFiles = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDropping(false)
    library.addFiles(droppedFiles(event.dataTransfer))
  }

  return (
    <aside
      className={`resource-panel panel-surface${dropping ? ' drop-active' : ''}`}
      aria-label="Files"
      onDragEnter={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={event => {
        // Moving between the panel's own children fires leave; only a real exit counts.
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDropping(false)
      }}
      onDrop={dropFiles}
    >
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
        <div className="resource-toolbar-actions">
          <FolderExportControl exporter={exporter} disabled={files.length === 0} />
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
        </div>
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
      {exporter.error && (
        <div className="file-status" role="alert">
          <span>{exporter.error}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss save error"
            onClick={exporter.dismissError}
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
          <>
            {files.length > 0 && (
              <ResourceList
                files={files}
                label="Files"
                activeId={activeId}
                onOpen={onOpen}
                onRemove={setRemoveCandidate}
                onSaveAs={id => void exporter.saveAs(id)}
                savingFileId={exporter.savingFileId}
                exportBusy={exporter.phase === 'saving' || exporter.savingFileId !== null}
              />
            )}
            {attachments.length > 0 && (
              <section className="resource-group" aria-labelledby="attachments-heading">
                <h3 id="attachments-heading">Attachments</h3>
                <ResourceList
                  files={attachments}
                  label="Attachments"
                  activeId={activeId}
                  onOpen={onOpen}
                  onRemove={setRemoveCandidate}
                  onSaveAs={id => void exporter.saveAs(id)}
                  savingFileId={exporter.savingFileId}
                  exportBusy={exporter.phase === 'saving' || exporter.savingFileId !== null}
                />
              </section>
            )}
          </>
        )}
      </div>
      {library.duplicateNames.length > 0 && (
        <DuplicateFilesDialog
          names={library.duplicateNames}
          onResolve={library.resolveDuplicates}
        />
      )}
      {removeCandidate && (
        <RemoveFileDialog
          file={removeCandidate}
          dirty={sourceDirty(drafts[removeCandidate.id])}
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
      {dropping && <span className="resource-drop-hint">Drop files to add them</span>}
    </aside>
  )
}
