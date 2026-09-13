import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type {
  ConversationCursor,
  ConversationPage,
  StoredConversation,
} from '../core/conversations'
import { openWorkspaceDatabase, requestPersistentStorage } from './workspace-database'

const defaultPageSize = 30
let persistenceRequested = false

const rememberPersistence = () => {
  if (persistenceRequested) return
  persistenceRequested = true
  void requestPersistentStorage()
}

export const listStoredConversations = async ({
  limit = defaultPageSize,
  before,
}: {
  limit?: number
  before?: ConversationCursor | null
} = {}): Promise<ConversationPage> => {
  const database = await openWorkspaceDatabase()
  const index = database.transaction('conversations').store.index('by-last-active')
  const range = before ? IDBKeyRange.upperBound(before, true) : undefined
  let cursor = await index.openCursor(range, 'prev')
  const items: StoredConversation[] = []
  while (cursor && items.length <= limit) {
    items.push(cursor.value)
    cursor = await cursor.continue()
  }
  const visible = items.slice(0, limit)
  const last = visible.at(-1)
  return {
    items: visible,
    nextCursor: items.length > limit && last ? ([last.lastActiveAt, last.id] as const) : null,
  }
}

export const getStoredConversation = async (id: string) => {
  const database = await openWorkspaceDatabase()
  const transaction = database.transaction(['conversations', 'messages'])
  const [conversation, records] = await Promise.all([
    transaction.objectStore('conversations').get(id),
    transaction.objectStore('messages').index('by-conversation').getAll(id),
    transaction.done,
  ])
  if (!conversation) return null
  return {
    conversation,
    messages: records
      .sort((left, right) => left.position - right.position)
      .map(record => record.message),
  }
}

export const saveStoredConversationDraft = async (conversation: StoredConversation) => {
  const database = await openWorkspaceDatabase()
  await database.put('conversations', conversation)
  rememberPersistence()
}

export const appendStoredConversationMessages = async ({
  conversation,
  startPosition,
  messages,
}: {
  conversation: StoredConversation
  startPosition: number
  messages: readonly AgentMessage[]
}) => {
  if (!messages.length) return
  const database = await openWorkspaceDatabase()
  const transaction = database.transaction(['conversations', 'messages'], 'readwrite')
  await Promise.all([
    transaction.objectStore('conversations').put(conversation),
    ...messages.map((message, index) =>
      transaction.objectStore('messages').put({
        conversationId: conversation.id,
        position: startPosition + index,
        message,
      }),
    ),
    transaction.done,
  ])
  rememberPersistence()
}

export const touchStoredConversation = async (id: string, lastActiveAt: number) => {
  const database = await openWorkspaceDatabase()
  const conversation = await database.get('conversations', id)
  if (!conversation) throw new Error('Conversation is unavailable.')
  const updated = { ...conversation, lastActiveAt }
  await database.put('conversations', updated)
  return updated
}

export const removeStoredConversation = async (id: string) => {
  const database = await openWorkspaceDatabase()
  const transaction = database.transaction(['conversations', 'messages'], 'readwrite')
  const messages = transaction.objectStore('messages').index('by-conversation')
  let cursor = await messages.openKeyCursor(id)
  while (cursor) {
    await transaction.objectStore('messages').delete(cursor.primaryKey)
    cursor = await cursor.continue()
  }
  await transaction.objectStore('conversations').delete(id)
  await transaction.done
}
