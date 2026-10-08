import { type EmbedSize, resizeEmbed } from '@gamma-reader/links'
import { useCallback } from 'react'
import { getStoredFile } from '../../../data/file-store'
import { decodeUtf8 } from '../../../utils/text'
import { useTextFileUpdates } from '../../workspace/workspace-context'

// Writes an embed's new size into the saved note, read afresh so the size lands on the text as it
// now stands. Unsaved edits in the note's source, or a save made meanwhile, take precedence: the
// size then stays only on screen.
export const useEmbedResize = (fileId: string) => {
  const { update, unsaved } = useTextFileUpdates()
  return useCallback(
    (raw: string, nth: number, size: EmbedSize) => {
      if (unsaved(fileId)) return
      const write = async () => {
        const stored = await getStoredFile(fileId)
        if (!stored) return
        const source = decodeUtf8(await stored.blob.arrayBuffer())
        if (source === null) return
        const resized = resizeEmbed(source, raw, nth, size)
        if (resized === null || resized === source) return
        const result = await update(fileId, stored.metadata.revision, resized)
        if (result.status === 'rejected')
          console.error('Unable to save an embed size', result.reason)
      }
      write().catch((cause: unknown) => console.error('Unable to save an embed size', cause))
    },
    [fileId, unsaved, update],
  )
}
