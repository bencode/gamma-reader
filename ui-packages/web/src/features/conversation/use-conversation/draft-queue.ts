import type { StoredConversation } from '../../../core/conversations'

// Drafts change on every keystroke. Only the latest one is waiting to be written, and one write
// runs at a time, so an older draft never lands after a newer one.
export const createDraftQueue = (write: (conversation: StoredConversation) => Promise<void>) => {
  let pending: StoredConversation | undefined
  let running: Promise<void> | undefined

  const drain = async () => {
    while (pending) {
      const conversation = pending
      pending = undefined
      await write(conversation)
    }
  }

  return {
    queue: (conversation: StoredConversation) => {
      pending = conversation
      running ??= drain().finally(() => {
        running = undefined
      })
      return running
    },
    idle: () => running,
  }
}
