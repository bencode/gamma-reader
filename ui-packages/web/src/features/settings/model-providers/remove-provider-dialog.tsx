import { ConfirmationDialog } from '../../../components/confirmation-dialog'

// The key is the one thing here the app cannot give back; the vendor's console has to.
export const RemoveProviderDialog = ({
  name,
  custom,
  onCancel,
  onRemove,
}: {
  name: string
  custom: boolean
  onCancel: () => void
  onRemove: () => void
}) => (
  <ConfirmationDialog label={`Remove ${name}`} onCancel={onCancel}>
    <h2>Remove {name}?</h2>
    <p>
      This deletes the key{custom ? ', address' : ''} and models saved for <strong>{name}</strong>{' '}
      in this browser. Adding it back needs the key again. Conversations on its models switch to the
      free allowance.
    </p>
    <div className="dialog-actions">
      <button type="button" className="text-button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="danger-button" onClick={onRemove}>
        Remove
      </button>
    </div>
  </ConfirmationDialog>
)
