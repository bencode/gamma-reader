import type { UserMessage } from '@earendil-works/pi-ai'
import type { PreviewKind, StoredFileMetadata } from '../files'

export type ConversationAttachment = Pick<
  StoredFileMetadata,
  'id' | 'name' | 'mediaType' | 'previewKind' | 'size'
>

export type ReaderUserMessage = UserMessage & {
  reader: {
    id: string
    text: string
    attachments: ConversationAttachment[]
  }
}

const recommendedTool = (kind: PreviewKind) => {
  if (kind === 'image') return 'analyze_image'
  if (kind === 'markdown' || kind === 'text' || kind === 'pdf' || kind === 'docx') return 'read'
  return 'unavailable'
}

export const createReaderUserMessage = (
  text: string,
  attachments: readonly ConversationAttachment[],
): ReaderUserMessage => {
  const reader = { id: crypto.randomUUID(), text, attachments: [...attachments] }
  const request = text || 'Review the attached workspace files.'
  const metadata = attachments.map(attachment => ({
    fileId: attachment.id,
    name: attachment.name,
    type: attachment.previewKind,
    recommendedTool: recommendedTool(attachment.previewKind),
  }))
  const content: UserMessage['content'] = attachments.length
    ? [
        { type: 'text', text: request },
        {
          type: 'text',
          text: `\n\nWorkspace attachment metadata (reference only; use fileId with tools):\n${JSON.stringify(metadata)}`,
        },
      ]
    : [{ type: 'text', text: request }]
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
