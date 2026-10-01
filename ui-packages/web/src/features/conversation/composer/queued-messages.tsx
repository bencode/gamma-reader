import { Paperclip, X } from 'lucide-react'
import type { ConversationDraft } from '../../../core/conversations'
import styles from './style.module.scss'

export const QueuedMessages = ({
  queued,
  onRemove,
}: {
  queued: readonly ConversationDraft[]
  onRemove: (index: number) => void
}) => {
  if (!queued.length) return null
  return (
    <ul className={styles.queued} aria-label="Queued messages">
      {queued.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: items have no identity; the list only appends and removes
        <li key={index} className={styles.queuedItem}>
          <span className={styles.queuedText}>
            {item.text || item.attachments.map(attachment => attachment.name).join(', ')}
          </span>
          {item.attachments.length > 0 && (
            <span className={styles.queuedAttachments}>
              <Paperclip size={11} aria-hidden />
              {item.attachments.length}
            </span>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Remove queued message"
            title="Remove queued message"
            onClick={() => onRemove(index)}
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  )
}
