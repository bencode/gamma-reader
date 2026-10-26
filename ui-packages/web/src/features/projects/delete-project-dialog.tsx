import { useEffect, useState } from 'react'
import { ConfirmationDialog as Modal } from '../../components/confirmation-dialog'
import type { StoredFileMetadata } from '../../core/files'
import { type Project, projectDeletionPath } from '../../core/projects'
import { countStoredConversations } from '../../data/conversation-store'
import { schedulePendingDeletion } from '../../data/project-store'
import type { FileExportController } from '../resources/use-file-export'

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

// "3 files, 2 attachments and 4 conversations"
const listed = (parts: readonly string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '')

export const DeleteProjectDialog = ({
  project,
  files,
  exporter,
  onCancel,
}: {
  project: Project
  files: readonly StoredFileMetadata[]
  exporter: FileExportController
  onCancel: () => void
}) => {
  const [conversationCount, setConversationCount] = useState<number | null>(null)
  useEffect(() => {
    let current = true
    countStoredConversations().then(
      count => {
        if (current) setConversationCount(count)
      },
      cause => console.error('Unable to count conversations', cause),
    )
    return () => {
      current = false
    }
  }, [])
  // Save to folder first writes the Files tree; attachments leave only one by one, through Save as….
  const attachmentCount = files.filter(file => file.collection === 'attachments').length
  const fileCount = files.length - attachmentCount
  const deleted = listed([
    ...(fileCount > 0 || attachmentCount === 0 ? [plural(fileCount, 'file')] : []),
    ...(attachmentCount > 0 ? [plural(attachmentCount, 'attachment')] : []),
    ...(conversationCount !== null ? [plural(conversationCount, 'conversation')] : []),
  ])
  const canExport = exporter.supported && fileCount > 0
  const exportBusy = exporter.phase === 'saving' || exporter.savingFileId !== null
  return (
    <Modal label={`Delete ${project.name}`} onCancel={onCancel}>
      <h2>Delete {project.name}?</h2>
      <p>
        This deletes {deleted} kept in this browser for the project. Originals on your computer will
        not change.
      </p>
      {attachmentCount > 0 && (
        <p>
          {canExport
            ? 'Save to folder first leaves attachments out; save each one with Save as… in Files.'
            : 'To keep attachments, save each one with Save as… in Files first.'}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        {canExport && (
          <button
            type="button"
            className="secondary-button"
            disabled={exportBusy}
            onClick={() => void exporter.saveToFolder()}
          >
            Save to folder first
          </button>
        )}
        <button
          type="button"
          className="danger-button"
          disabled={exportBusy}
          onClick={() => {
            // The next page deletes the library before anything opens it; this one still holds it.
            schedulePendingDeletion(project.id)
            window.location.assign(projectDeletionPath(project.id))
          }}
        >
          Delete project
        </button>
      </div>
    </Modal>
  )
}
