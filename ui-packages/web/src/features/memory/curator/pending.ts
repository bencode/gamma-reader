import type { ConversationCursor, StoredConversation } from '../../../core/conversations'
import { getStoredConversation, listStoredConversations } from '../../../data/conversation-store'
import { workspaceStorageBases, workspaceStorageKey } from '../../../data/workspace-database'
import { readProgress } from '../store'
import { readerMessageCount } from '../transcript'

// A few remarks are not yet worth a note; they wait until there is more to go on.
const minimumReaderMessages = 3
// The conversation open in this project may still be going on; it waits until nothing has been
// said in it for a while. Opening a conversation touches it, so quiet is measured by its messages.
const quietAfter = 30 * 60 * 1000

export type PendingConversation = {
  id: string
  title: string | null
  lastSaidAt: number
  from: number
  messageCount: number
}

const allConversations = async (
  before: ConversationCursor | null = null,
): Promise<StoredConversation[]> => {
  const page = await listStoredConversations({ limit: 100, before })
  return page.nextCursor
    ? [...page.items, ...(await allConversations(page.nextCursor))]
    : page.items
}

// The project's conversations with enough said since they were last organized, newest first.
export const pendingConversations = async (projectKey: string, now = Date.now()) => {
  const [conversations, progress] = await Promise.all([
    allConversations(),
    readProgress(projectKey),
  ])
  const active = localStorage.getItem(workspaceStorageKey(workspaceStorageBases.activeConversation))
  const pending = await Promise.all(
    conversations.map(async (conversation): Promise<PendingConversation | null> => {
      const from = progress.get(conversation.id) ?? 0
      const stored = await getStoredConversation(conversation.id)
      if (!stored || readerMessageCount(stored.messages, from) < minimumReaderMessages) return null
      const lastSaidAt = Math.max(0, ...stored.messages.map(message => message.timestamp))
      if (conversation.id === active && now - lastSaidAt <= quietAfter) return null
      return {
        id: conversation.id,
        title: conversation.title,
        lastSaidAt,
        from,
        messageCount: stored.messages.length,
      }
    }),
  )
  return pending.filter(item => item !== null)
}
