import { useState } from 'react'
import { ConfirmationDialog } from '../../components/confirmation-dialog'
import type { Workspace } from '../../shell/use-workspace'
import { useSourceDrafts, useWorkspaceSourceActions } from '../../shell/workspace-context'
import { sourceDirty } from '../../shell/workspace-store'

export const UnsavedSourceDialog = ({
  fileIds,
  workspace,
  onCancel,
  onClose,
}: {
  fileIds: readonly string[]
  workspace: Workspace
  onCancel: () => void
  onClose: () => void
}) => {
  const drafts = useSourceDrafts()
  const { saveSource } = useWorkspaceSourceActions()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = saving || fileIds.some(id => drafts[id]?.savePhase === 'saving')
  const files = fileIds.flatMap(id => {
    const file = workspace.files.find(file => file.id === id)
    return file &&
      (sourceDirty(drafts[id]) || drafts[id]?.savePhase === 'saving' || drafts[id]?.saveError)
      ? [file]
      : []
  })
  const saveAndClose = async () => {
    setSaving(true)
    setNotice(null)
    try {
      for (const id of fileIds) {
        if (!sourceDirty(workspace.store.getState().sourceDrafts[id])) continue
        if ((await saveSource(id)) !== 'saved') return
      }
      const latest = workspace.store.getState().sourceDrafts
      if (fileIds.some(id => sourceDirty(latest[id]) || latest[id]?.savePhase === 'saving')) {
        setNotice('Some documents still have unsaved changes. Save again before closing.')
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }
  return (
    <ConfirmationDialog
      label={
        fileIds.length === 1
          ? `Save changes to ${workspace.files.find(file => file.id === fileIds[0])?.name ?? 'document'}`
          : 'Save changes before closing'
      }
      onCancel={() => {
        if (!busy) onCancel()
      }}
    >
      <h2>Save changes?</h2>
      <p>These documents have unsaved source changes.</p>
      <ul style={{ maxHeight: '40dvh', overflowY: 'auto', overflowWrap: 'anywhere' }}>
        {files.map(file => (
          <li key={file.id}>
            {file.name}
            {drafts[file.id]?.saveError && <p role="alert">{drafts[file.id]?.saveError}</p>}
          </li>
        ))}
      </ul>
      {notice && <p role="alert">{notice}</p>}
      <div className="dialog-actions">
        <button type="button" className="text-button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
          Discard and close
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void saveAndClose()}
        >
          {busy ? 'Saving…' : 'Save and close'}
        </button>
      </div>
    </ConfirmationDialog>
  )
}
