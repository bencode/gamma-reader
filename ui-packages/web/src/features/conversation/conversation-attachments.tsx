import { File, FileImage, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConversationAttachment } from '../../core/agent/reader-message'
import { formatBytes } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'
import type { DraftAttachment } from './use-draft-attachments'

const useImageUrl = (attachment: DraftAttachment | ConversationAttachment) => {
  const isImage =
    'status' in attachment
      ? attachment.status === 'ready'
        ? attachment.metadata.previewKind === 'image'
        : attachment.file.type.startsWith('image/')
      : attachment.previewKind === 'image'
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!isImage) return
    let active = true
    let objectUrl: string | undefined
    const load = async () => {
      const blob =
        'status' in attachment
          ? attachment.status === 'ready'
            ? await getStoredFileContent(attachment.metadata.id)
            : attachment.file
          : await getStoredFileContent(attachment.id)
      if (!active || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }
    void load().catch(error => console.error('Unable to load attachment preview', error))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attachment, isImage])
  return url
}

const AttachmentPreview = ({
  attachment,
  name,
}: {
  attachment: DraftAttachment | ConversationAttachment
  name: string
}) => {
  const url = useImageUrl(attachment)
  if (url) return <img src={url} alt="" />
  const image =
    'status' in attachment
      ? attachment.status === 'ready'
        ? attachment.metadata.previewKind === 'image'
        : attachment.file.type.startsWith('image/')
      : attachment.previewKind === 'image'
  return image ? <FileImage size={17} aria-label={`${name} image`} /> : <File size={17} />
}

export const DraftAttachmentTray = ({
  attachments,
  onOpen,
  onRetry,
  onRemove,
  availableFileIds,
}: {
  attachments: DraftAttachment[]
  onOpen: (id: string) => void
  onRetry: (key: string) => void
  onRemove: (key: string) => void
  availableFileIds: ReadonlySet<string>
}) => {
  if (!attachments.length) return null
  return (
    <ul className="draft-attachments" aria-label="Attachments to send">
      {attachments.map(attachment => {
        const ready = attachment.status === 'ready'
        const available = ready && availableFileIds.has(attachment.metadata.id)
        const name = ready ? attachment.metadata.name : attachment.file.name
        const size = ready ? attachment.metadata.size : attachment.file.size
        return (
          <li key={attachment.key} className={`draft-attachment ${attachment.status}`}>
            <button
              type="button"
              className="attachment-main"
              disabled={!available}
              onClick={() => {
                if (available) onOpen(attachment.metadata.id)
              }}
              title={available ? `Open ${name}` : name}
            >
              <span className="attachment-preview">
                <AttachmentPreview attachment={attachment} name={name} />
              </span>
              <span className="attachment-copy">
                <strong>{name}</strong>
                <small>
                  {attachment.status === 'adding'
                    ? 'Adding…'
                    : attachment.status === 'failed'
                      ? attachment.error
                      : !available
                        ? 'Unavailable'
                        : formatBytes(size)}
                </small>
              </span>
              {attachment.status === 'adding' && (
                <LoaderCircle className="attachment-spinner" size={14} aria-hidden="true" />
              )}
            </button>
            {attachment.status === 'failed' && (
              <button
                type="button"
                className="icon-button attachment-action"
                aria-label={`Retry ${name}`}
                onClick={() => onRetry(attachment.key)}
              >
                <RefreshCw size={13} />
              </button>
            )}
            <button
              type="button"
              className="icon-button attachment-action"
              aria-label={`Remove ${name} from message`}
              onClick={() => onRemove(attachment.key)}
            >
              <X size={13} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export const MessageAttachments = ({
  attachments,
  onOpen,
  availableFileIds,
}: {
  attachments: ConversationAttachment[]
  onOpen: (id: string) => void
  availableFileIds: ReadonlySet<string>
}) => {
  if (!attachments.length) return null
  return (
    <ul className="message-attachments" aria-label="Message attachments">
      {attachments.map(attachment => (
        <li key={attachment.id}>
          <button
            type="button"
            disabled={!availableFileIds.has(attachment.id)}
            onClick={() => onOpen(attachment.id)}
          >
            <span className="attachment-preview">
              <AttachmentPreview attachment={attachment} name={attachment.name} />
            </span>
            <span className="attachment-copy">
              <strong>{attachment.name}</strong>
              <small>
                {availableFileIds.has(attachment.id) ? formatBytes(attachment.size) : 'Unavailable'}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
