import { useEffect, useState } from 'react'
import { ConfirmationDialog as Modal } from '../../components/confirmation-dialog'
import type { Project } from '../../core/projects'
import { countStoredConversations } from '../../data/conversation-store'
import { deleteProject } from '../../data/project-store'
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
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="text-button" onClick={onCancel} disabled={deleting}>
          Cancel
        </button>
        {exporter.supported && fileCount > 0 && (
          <button
            type="button"
            className="secondary-button"
            disabled={deleting || exportBusy}
            onClick={() => void exporter.saveToFolder()}
          >
            Save to folder first
          </button>
        )}
        <button
          type="button"
          className="danger-button"
          disabled={deleting || exportBusy}
          onClick={() => {
            setDeleting(true)
            setError(null)
            deleteProject(project).then(
              () => window.location.assign('/'),
              cause => {
                console.error('Unable to delete project', cause)
                setError(
                  'The project could not be deleted. Close other tabs that have it open, then try again.',
                )
                setDeleting(false)
              },
            )
          }}
        >
          {deleting ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </Modal>
  )
}
