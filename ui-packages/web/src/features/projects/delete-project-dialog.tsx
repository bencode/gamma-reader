import { useEffect, useState } from 'react'
import { ConfirmationDialog as Modal } from '../../components/confirmation-dialog'
import { type Project, projectDeletionPath } from '../../core/projects'
import { countStoredConversations } from '../../data/conversation-store'
import { schedulePendingDeletion } from '../../data/project-store'
import type { FileExportController } from '../resources/use-file-export'

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export const DeleteProjectDialog = ({
  project,
  fileCount,
  exporter,
  onCancel,
}: {
  project: Project
  fileCount: number
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
  const exportBusy = exporter.phase === 'saving' || exporter.savingFileId !== null
  return (
    <Modal label={`Delete ${project.name}`} onCancel={onCancel}>
      <h2>Delete {project.name}?</h2>
      <p>
        This deletes {plural(fileCount, 'file')}
        {conversationCount !== null && ` and ${plural(conversationCount, 'conversation')}`} kept in
        this browser for the project. Originals on your computer will not change.
      </p>
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        {exporter.supported && fileCount > 0 && (
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
