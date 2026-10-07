import { useEffect, useId, useState } from 'react'
import { ConfirmationDialog } from '../../components/confirmation-dialog'
import { refreshMemoryEnabled, setMemoryEnabled, useMemoryEnabled } from './settings'
import { listMemories } from './store'
import styles from './style.module.scss'

// The switch, and the way to the Memory page where notes are read and corrected. Without a project
// open there is no page to go to, so the dialog holds the switch alone.
export const MemoryDialog = ({
  onClose,
  onOpenMemory,
}: {
  onClose: () => void
  onOpenMemory?: () => void
}) => {
  const enabled = useMemoryEnabled()
  const switchId = useId()
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    refreshMemoryEnabled()
    let current = true
    listMemories().then(
      saved => {
        if (current) setCount(saved.length)
      },
      cause => {
        console.error('Unable to read memory', cause)
      },
    )
    return () => {
      current = false
    }
  }, [])
  return (
    <ConfirmationDialog label="Memory" onCancel={onClose}>
      <h2>Memory</h2>
      <label className={styles.switch} htmlFor={switchId}>
        <input
          id={switchId}
          type="checkbox"
          checked={enabled}
          onChange={event => setMemoryEnabled(event.target.checked)}
        />
        Let the assistant remember what you ask it to
      </label>
      <p>
        Say “remember…” in any conversation, or “forget…” to let a note go. What is about you is
        recalled in every project; what is about a project stays with it. Remembered notes go to the
        model with your questions, and each one adds a little to what a conversation uses.
      </p>
      {count !== null && count > 0 && (
        <p className={styles.count}>{count === 1 ? '1 note kept' : `${count} notes kept`}</p>
      )}
      <div className="dialog-actions">
        {onOpenMemory && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onClose()
              onOpenMemory()
            }}
          >
            Open memory
          </button>
        )}
        <button type="button" className="primary-button" onClick={onClose}>
          Done
        </button>
      </div>
    </ConfirmationDialog>
  )
}
