import { PanelLeft, X } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { Project } from '../../core/projects'
import { useSourceDrafts } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'
import { ProjectSwitcher } from '../projects/project-switcher'
import { AddMenu } from './add-menu'
import { DuplicateFilesDialog, RemoveFileDialog } from './file-dialogs'
import { FolderExportControl } from './folder-export-control'
import {
  entriesFromInput,
  folderImportSupported,
  folderPickerAvailable,
  pickFolder,
  readPickedFolder,
} from './pick-folder'
import { ResourceTree } from './resource-tree'
import type { FileExportController } from './use-file-export'
import type { FileLibrary } from './use-file-library'

type ResourcePanelProps = {
  project: Project
  activeId: string | null
  library: FileLibrary
  exporter: FileExportController
  onOpen: (id: string) => void
  onRemoved: (id: string) => void
  onClose: () => void
}

// A dropped folder arrives as a File whose contents cannot be read, and importing it would
// leave an entry in the library that never opens. The Add files button cannot reach one.
const droppedFiles = (transfer: DataTransfer) => {
  const files = Array.from(transfer.files)
  // files holds exactly the items whose kind is file, in the same order, so the entry that
  // says whether something is a folder is the one at the same index.
  const entries = Array.from(transfer.items).filter(item => item.kind === 'file')
  if (entries.length !== files.length) return files
  return files.filter((_, index) => !entries[index]?.webkitGetAsEntry?.()?.isDirectory)
}

export const ResourcePanel = ({
  project,
  activeId,
  library,
  exporter,
  onOpen,
  onRemoved,
  onClose,
}: ResourcePanelProps) => {
  const drafts = useSourceDrafts()
  const inputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  // The folder picker reads a folder in place; elsewhere a folder input hands over its files.
  const addFolder = folderImportSupported()
    ? () => {
        if (folderPickerAvailable())
          void library.addFolder(async onRead => readPickedFolder(await pickFolder(), onRead))
        else folderInputRef.current?.click()
      }
    : undefined
  const [removeCandidate, setRemoveCandidate] = useState<StoredFileMetadata | null>(null)
  const [dropping, setDropping] = useState(false)
  const files = library.files.filter(file => (file.collection ?? 'files') === 'files')
  const attachments = library.files.filter(file => file.collection === 'attachments')

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
        <ProjectSwitcher project={project} fileCount={library.files.length} exporter={exporter} />
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
          <AddMenu
            disabled={library.loading || library.importing}
            onAddFiles={() => inputRef.current?.click()}
            onAddFolder={addFolder}
          />
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
        {/* Browsers without the folder picker still let an input choose a whole folder. */}
        <input
          ref={node => {
            folderInputRef.current = node
            node?.setAttribute('webkitdirectory', '')
          }}
          className="visually-hidden"
          type="file"
          aria-label="Choose a folder"
          multiple
          onChange={event => {
            const entries = entriesFromInput(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
            void library.addFolder(async () => entries)
          }}
        />
      </div>
      {library.progress && (
        <p className="file-progress" role="status">
          {library.progress}
        </p>
      )}
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
              <ResourceTree
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
                <ResourceTree
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
      {library.duplicatePaths.length > 0 && (
        <DuplicateFilesDialog
          names={library.duplicatePaths}
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
