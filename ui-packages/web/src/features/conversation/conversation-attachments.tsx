import { File, FileImage, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConversationAttachment } from '../../core/agent/reader-message'
import { formatBytes, previewKindFor } from '../../core/files'
import { getStoredFileContent } from '../../data/file-store'
import {
  ImageLightbox,
  type ImageLightboxImage,
  type ImageLightboxNavigation,
} from './image-lightbox'
import type { DraftAttachment } from './use-draft-attachments'

const isImageAttachment = (attachment: DraftAttachment | ConversationAttachment) =>
  'status' in attachment
    ? attachment.status === 'ready'
      ? attachment.metadata.previewKind === 'image'
      : previewKindFor(attachment.file.name, attachment.file.type) === 'image'
    : attachment.previewKind === 'image'

const useImageUrl = (attachment: DraftAttachment | ConversationAttachment) => {
  const isImage = isImageAttachment(attachment)
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
  const image = isImageAttachment(attachment)
  return image ? <FileImage size={17} aria-label={`${name} image`} /> : <File size={17} />
}

const navigationFor = (
  images: readonly ImageLightboxImage[],
  index: number,
  onChange: (key: string) => void,
): ImageLightboxNavigation | undefined => {
  if (images.length <= 1) return undefined
  const previous = images[index - 1]
  const next = images[index + 1]
  return {
    index,
    total: images.length,
    onPrevious: previous ? () => onChange(previous.key) : undefined,
    onNext: next ? () => onChange(next.key) : undefined,
  }
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
  const [activeImageKey, setActiveImageKey] = useState<string>()
  const images = attachments.flatMap<ImageLightboxImage>(attachment => {
    if (!isImageAttachment(attachment)) return []
    if (attachment.status !== 'ready')
      return [
        {
          key: attachment.key,
          name: attachment.file.name,
          load: () => Promise.resolve(attachment.file),
        },
      ]
    if (!availableFileIds.has(attachment.metadata.id)) return []
    return [
      {
        key: attachment.key,
        name: attachment.metadata.name,
        load: () => getStoredFileContent(attachment.metadata.id).then(blob => blob ?? undefined),
      },
    ]
  })
  const activeImageIndex = images.findIndex(image => image.key === activeImageKey)
  const activeImage = images[activeImageIndex]
  const activeAttachment = attachments.find(attachment => attachment.key === activeImageKey)
  const activeFileId =
    activeAttachment?.status === 'ready' && availableFileIds.has(activeAttachment.metadata.id)
      ? activeAttachment.metadata.id
      : undefined
  if (!attachments.length) return null
  return (
    <>
      <ul className="draft-attachments" aria-label="Attachments to send">
        {attachments.map(attachment => {
          const ready = attachment.status === 'ready'
          const available = ready && availableFileIds.has(attachment.metadata.id)
          const image = isImageAttachment(attachment)
          const canPreview = image && (!ready || available)
          const name = ready ? attachment.metadata.name : attachment.file.name
          const size = ready ? attachment.metadata.size : attachment.file.size
          return (
            <li key={attachment.key} className={`draft-attachment ${attachment.status}`}>
              <button
                type="button"
                className="attachment-main"
                disabled={!canPreview && !available}
                onClick={() => {
                  if (canPreview) setActiveImageKey(attachment.key)
                  else if (available) onOpen(attachment.metadata.id)
                }}
                title={canPreview ? `Preview ${name}` : available ? `Open ${name}` : name}
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
      {activeImage && (
        <ImageLightbox
          image={activeImage}
          navigation={navigationFor(images, activeImageIndex, setActiveImageKey)}
          onOpen={activeFileId ? () => onOpen(activeFileId) : undefined}
          onClose={() => setActiveImageKey(undefined)}
        />
      )}
    </>
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
  const [activeImageKey, setActiveImageKey] = useState<string>()
  const images = attachments.flatMap<ImageLightboxImage>(attachment =>
    attachment.previewKind === 'image' && availableFileIds.has(attachment.id)
      ? [
          {
            key: attachment.id,
            name: attachment.name,
            load: () => getStoredFileContent(attachment.id).then(blob => blob ?? undefined),
          },
        ]
      : [],
  )
  const activeImageIndex = images.findIndex(image => image.key === activeImageKey)
  const activeImage = images[activeImageIndex]
  if (!attachments.length) return null
  return (
    <>
      <ul className="message-attachments" aria-label="Message attachments">
        {attachments.map(attachment => {
          const available = availableFileIds.has(attachment.id)
          const image = attachment.previewKind === 'image'
          return (
            <li key={attachment.id}>
              <button
                type="button"
                disabled={!available}
                onClick={() => {
                  if (image) setActiveImageKey(attachment.id)
                  else onOpen(attachment.id)
                }}
                title={available ? `${image ? 'Preview' : 'Open'} ${attachment.name}` : undefined}
              >
                <span className="attachment-preview">
                  <AttachmentPreview attachment={attachment} name={attachment.name} />
                </span>
                <span className="attachment-copy">
                  <strong>{attachment.name}</strong>
                  <small>{available ? formatBytes(attachment.size) : 'Unavailable'}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {activeImage && (
        <ImageLightbox
          image={activeImage}
          navigation={navigationFor(images, activeImageIndex, setActiveImageKey)}
          onOpen={() => onOpen(activeImage.key)}
          onClose={() => setActiveImageKey(undefined)}
        />
      )}
    </>
  )
}
