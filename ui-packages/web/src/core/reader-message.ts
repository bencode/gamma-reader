import type { UserMessage } from '@earendil-works/pi-ai'
import { nanoid } from 'nanoid'
import type { PreviewKind, StoredFileMetadata } from './files'

// Saved with the conversation, so the name stays what the reader saw when they attached it.
export type ConversationAttachment = Pick<
  StoredFileMetadata,
  'id' | 'mediaType' | 'previewKind' | 'size'
> & { name: string }

// A workspace file the reader named with @ in a message.
export type FileReference = Pick<StoredFileMetadata, 'id' | 'path' | 'previewKind'>

export type ReaderUserMessage = UserMessage & {
  reader: {
    id: string
    text: string
    attachments: ConversationAttachment[]
  }
}

const recommendedTool = (kind: PreviewKind) => (kind === 'image' ? 'analyze_image' : 'read')

const fileMetadata = (fileId: string, path: string, type: PreviewKind) => ({
  fileId,
  path,
  type,
  recommendedTool: recommendedTool(type),
})

const metadataPart = (label: string, metadata: readonly unknown[]) =>
  metadata.length
    ? [
        {
          type: 'text' as const,
          text: `\n\n${label} (reference only; use fileId with tools):\n${JSON.stringify(metadata)}`,
        },
      ]
    : []

export const createReaderUserMessage = (
  text: string,
  attachments: readonly ConversationAttachment[],
  references: readonly FileReference[] = [],
): ReaderUserMessage => {
  const reader = { id: nanoid(), text, attachments: [...attachments] }
  const request = text || 'Review the attached workspace files.'
  const content: UserMessage['content'] = [
    { type: 'text', text: request },
    ...metadataPart(
      'Workspace attachment metadata',
      // Attachments are always stored at the library root, so the name they keep is their path.
      attachments.map(item => fileMetadata(item.id, item.name, item.previewKind)),
    ),
    ...metadataPart(
      'Files the reader referenced with @',
      references.map(item => fileMetadata(item.id, item.path, item.previewKind)),
    ),
  ]
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
    reader,
  }
}

export const isReaderUserMessage = (message: unknown): message is ReaderUserMessage => {
  if (!message || typeof message !== 'object' || !('reader' in message)) return false
  const reader = message.reader
  return (
    typeof reader === 'object' &&
    reader !== null &&
    'id' in reader &&
    typeof reader.id === 'string' &&
    'text' in reader &&
    typeof reader.text === 'string' &&
    'attachments' in reader &&
    Array.isArray(reader.attachments)
  )
}
