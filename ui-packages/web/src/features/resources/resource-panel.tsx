import { PanelLeft, X } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import type { StoredFileMetadata } from '../../core/files'
import type { Project } from '../../core/projects'
import { useSourceDrafts } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'
import { ProjectSwitcher } from '../projects/project-switcher'
import { SourceSyncStatus } from '../source/sync-status'
import { AddFromUrlDialog } from './add-from-url-dialog'
import { AddMenu } from './add-menu'
import { DuplicateFilesDialog, RemoveFileDialog, RemoveFolderDialog } from './file-dialogs'
import { filesInFolder } from './file-tree'
import { FolderExportControl } from './folder-export-control'
import {
  entriesFromInput,
  folderImportSupported,
  folderPickerAvailable,
  pickFolder,
  readDroppedEntries,
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
  onRemoved: (ids: readonly string[]) => void
  onClose: () => void
}

// A dropped folder arrives as a File whose contents cannot be read, so a drop holding one is read
// entry by entry, as Add folder reads a chosen folder. The entries must be taken while the drop
// event runs; the transfer is emptied as soon as it ends.
const droppedFolderEntries = (transfer: DataTransfer) => {
  const entries = Array.from(transfer.items)
    .filter(item => item.kind === 'file')
    .flatMap(item => item.webkitGetAsEntry?.() ?? [])
  return entries.some(entry => entry.isDirectory) ? entries : null
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
  const [removal, setRemoval] = useState<
    { kind: 'file'; file: StoredFileMetadata } | { kind: 'folder'; path: string } | null
  >(null)
  const remove = (ids: readonly string[]) =>
    void library.removeFiles(ids).then(removed => {
      if (removed) onRemoved(ids)
      setRemoval(null)
    })
  const [dropping, setDropping] = useState(false)
  const [addingUrl, setAddingUrl] = useState(false)
  // A file from an address opens once the library lists it; opening checks that list.
  const [openWhenListed, setOpenWhenListed] = useState<string | null>(null)
  useEffect(() => {
    if (!openWhenListed || !library.files.some(file => file.id === openWhenListed)) return
    setOpenWhenListed(null)
    onOpen(openWhenListed)
  }, [openWhenListed, library.files, onOpen])
  const files = library.files.filter(file => (file.collection ?? 'files') === 'files')
  // A folder's files are read when the dialog renders and when it confirms, so anything added to
  // the folder while it is open is counted and removed too.
  const folderFiles = removal?.kind === 'folder' ? filesInFolder(files, removal.path) : []
  const attachments = library.files.filter(file => file.collection === 'attachments')

  const dropFiles = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDropping(false)
    const folderEntries = droppedFolderEntries(event.dataTransfer)
    if (folderEntries) void library.addFolder(onRead => readDroppedEntries(folderEntries, onRead))
    else library.addFiles(Array.from(event.dataTransfer.files))
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
            onAddFromUrl={() => setAddingUrl(true)}
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
      {project.source && (
        <SourceSyncStatus source={project.source} reload={library.reload} files={library.files} />
      )}
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
                onRemove={file => setRemoval({ kind: 'file', file })}
                onRemoveFolder={path => setRemoval({ kind: 'folder', path })}
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
                  onRemove={file => setRemoval({ kind: 'file', file })}
                  onRemoveFolder={path => setRemoval({ kind: 'folder', path })}
                  onSaveAs={id => void exporter.saveAs(id)}
                  savingFileId={exporter.savingFileId}
                  exportBusy={exporter.phase === 'saving' || exporter.savingFileId !== null}
                />
              </section>
            )}
          </>
        )}
      </div>
      {addingUrl && (
        <AddFromUrlDialog
          onCancel={() => setAddingUrl(false)}
          onAdd={target => {
            setAddingUrl(false)
            void library.addFromUrl(target).then(id => {
              if (id) setOpenWhenListed(id)
            })
          }}
        />
      )}
      {library.duplicatePaths.length > 0 && (
        <DuplicateFilesDialog
          names={library.duplicatePaths}
          onResolve={library.resolveDuplicates}
        />
      )}
      {removal?.kind === 'file' && (
        <RemoveFileDialog
          file={removal.file}
          dirty={sourceDirty(drafts[removal.file.id])}
          onCancel={() => setRemoval(null)}
          onRemove={() => remove([removal.file.id])}
        />
      )}
      {removal?.kind === 'folder' && (
        <RemoveFolderDialog
          path={removal.path}
          count={folderFiles.length}
          dirty={folderFiles.some(file => sourceDirty(drafts[file.id]))}
          onCancel={() => setRemoval(null)}
          onRemove={() => remove(folderFiles.map(file => file.id))}
        />
      )}
      {dropping && <span className="resource-drop-hint">Drop files or folders to add them</span>}
    </aside>
  )
}
