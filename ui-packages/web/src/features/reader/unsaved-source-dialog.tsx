import { ConfirmationDialog } from '../../components/confirmation-dialog'
import type { Workspace } from '../../shell/use-workspace'
import { useWorkspaceSource, useWorkspaceSourceActions } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'

export const UnsavedSourceDialog = ({
  fileId,
  name,
  workspace,
  onCancel,
  onClose,
}: {
  fileId: string
  name: string
  workspace: Workspace
  onCancel: () => void
  onClose: () => void
}) => {
  const draft = useWorkspaceSource(fileId)
  const { saveSource } = useWorkspaceSourceActions()
  const saving = draft?.savePhase === 'saving'
  const saveAndClose = async () => {
    const result = await saveSource(fileId)
    if (result === 'saved' && !sourceDirty(workspace.store.getState().sourceDrafts[fileId]))
      onClose()
  }
  return (
    <ConfirmationDialog
      label={`Save changes to ${name}`}
      onCancel={() => {
        if (!saving) onCancel()
      }}
    >
      <h2>Save changes?</h2>
      <p>{name} has unsaved source changes.</p>
      {draft?.saveError && <p role="alert">{draft.saveError}</p>}
      <div className="dialog-actions">
        <button type="button" className="text-button" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>
          Discard
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={() => void saveAndClose()}
        >
          {saving ? 'Saving…' : 'Save and close'}
        </button>
      </div>
    </ConfirmationDialog>
  )
}
