import { ConfirmationDialog } from '../../components/confirmation-dialog'

export const DeleteConversationDialog = ({
  title,
  onCancel,
  onDelete,
}: {
  title: string
  onCancel: () => void
  onDelete: () => void
}) => (
  <ConfirmationDialog label={`Delete ${title}`} onCancel={onCancel}>
    <h2>Delete this conversation?</h2>
    <p>
      <strong>{title}</strong> and all its messages are deleted from this browser. This cannot be
      undone.
    </p>
    <div className="dialog-actions">
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="danger-button" onClick={onDelete}>
        Delete
      </button>
    </div>
  </ConfirmationDialog>
)
