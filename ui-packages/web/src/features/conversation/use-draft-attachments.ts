import { useCallback, useRef, useState } from 'react'
import type { ImportResult, StoredFileMetadata } from '../../core/files'

export type DraftAttachment =
  | { key: string; file: File; status: 'adding' }
  | { key: string; file: File; status: 'failed'; error: string }
  | { key: string; metadata: StoredFileMetadata; status: 'ready' }

type AddWorkspaceAttachments = (files: readonly File[]) => Promise<ImportResult>

const maximumDraftAttachments = 10

const rejectionText = (reason: ImportResult['rejected'][number]['reason']) => {
  if (reason === 'file-too-large') return 'File is over 50 MB.'
  if (reason === 'library-full') return 'The 500 MB workspace limit is full.'
  return 'The browser could not store this file.'
}

export const useDraftAttachments = (importFiles: AddWorkspaceAttachments) => {
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const update = useCallback((transform: (current: DraftAttachment[]) => DraftAttachment[]) => {
    setAttachments(current => {
      const next = transform(current)
      attachmentsRef.current = next
      return next
    })
  }, [])

  const add = useCallback(
    async (selected: readonly File[]) => {
      const current = attachmentsRef.current
      if (current.some(item => item.status === 'adding')) return
      const accepted = selected.slice(0, maximumDraftAttachments - current.length)
      if (!accepted.length) return
      const pending = accepted.map(file => ({
        key: crypto.randomUUID(),
        file,
        status: 'adding' as const,
      }))
      update(items => [...items, ...pending])
      try {
        const result = await importFiles(accepted)
        const imported = new Map(result.imported.map(item => [item.sourceIndex, item.metadata]))
        const rejected = new Map(result.rejected.map(item => [item.sourceIndex, item.reason]))
        update(items =>
          items.map(item => {
            const index = pending.findIndex(candidate => candidate.key === item.key)
            if (index < 0 || item.status !== 'adding') return item
            const metadata = imported.get(index)
            if (metadata) return { key: item.key, metadata, status: 'ready' }
            return {
              key: item.key,
              file: item.file,
              status: 'failed',
              error: rejectionText(rejected.get(index) ?? 'storage-unavailable'),
            }
          }),
        )
      } catch (error) {
        console.error('Unable to add chat attachments', error)
        update(items =>
          items.map(item =>
            pending.some(candidate => candidate.key === item.key) && item.status === 'adding'
              ? { ...item, status: 'failed', error: 'File could not be added.' }
              : item,
          ),
        )
      }
    },
    [importFiles, update],
  )

  const retry = useCallback(
    async (key: string) => {
      const failed = attachmentsRef.current.find(
        (item): item is Extract<DraftAttachment, { status: 'failed' }> =>
          item.key === key && item.status === 'failed',
      )
      if (!failed || attachmentsRef.current.some(item => item.status === 'adding')) return
      update(items =>
        items.map(item => (item.key === key ? { key, file: failed.file, status: 'adding' } : item)),
      )
      try {
        const result = await importFiles([failed.file])
        const metadata = result.imported[0]?.metadata
        const reason = result.rejected[0]?.reason
        update(items =>
          items.map(item =>
            item.key !== key || item.status !== 'adding'
              ? item
              : metadata
                ? { key, metadata, status: 'ready' }
                : {
                    key,
                    file: failed.file,
                    status: 'failed',
                    error: rejectionText(reason ?? 'storage-unavailable'),
                  },
          ),
        )
      } catch (error) {
        console.error('Unable to retry chat attachment', error)
        update(items =>
          items.map(item =>
            item.key === key && item.status === 'adding'
              ? { key, file: failed.file, status: 'failed', error: 'File could not be added.' }
              : item,
          ),
        )
      }
    },
    [importFiles, update],
  )

  const remove = useCallback(
    (key: string) => update(items => items.filter(item => item.key !== key)),
    [update],
  )

  const takeReady = useCallback(() => {
    const ready = attachmentsRef.current.filter(
      (item): item is Extract<DraftAttachment, { status: 'ready' }> => item.status === 'ready',
    )
    update(items => items.filter(item => item.status !== 'ready'))
    return ready
  }, [update])

  const restore = useCallback(
    (items: readonly Extract<DraftAttachment, { status: 'ready' }>[]) =>
      update(current => [...items, ...current].slice(0, maximumDraftAttachments)),
    [update],
  )

  return {
    attachments,
    add,
    retry,
    remove,
    takeReady,
    restore,
    limitReached: attachments.length >= maximumDraftAttachments,
    unsettled: attachments.some(item => item.status !== 'ready'),
  }
}
